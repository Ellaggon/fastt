import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import { invalidateProduct, invalidateProvider, invalidatePricing } from "@/lib/cache/invalidation"
import {
	assignTaxFeeUseCase,
	listTaxFeeAssignmentsByScopeUseCase,
} from "@/container/taxes-fees.container"
import { productRepository, ratePlanRepository, variantManagementRepository } from "@/container"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { db, eq, TaxFeeAssignment, TaxFeeDefinition } from "@/shared/infrastructure/db/compat"

const listSchema = z.object({
	scope: z.enum(["product", "variant", "rate_plan", "provider"]),
	scopeId: z.string().min(1),
})

const assignSchema = z.object({
	taxFeeDefinitionId: z.string().min(1),
	scope: z.enum(["product", "variant", "rate_plan", "provider"]),
	scopeId: z.string().min(1),
	channel: z.string().optional().nullable(),
	effectiveFrom: z.string().datetime().optional().nullable(),
	effectiveTo: z.string().datetime().optional().nullable(),
})

const updateAssignmentSchema = z.object({
	assignmentId: z.string().min(1),
	status: z.enum(["active", "archived"]),
})

async function invalidateTaxFeeAssignmentCaches(params: {
	providerId: string
	scope: "product" | "variant" | "rate_plan" | "provider"
	scopeId: string
}) {
	if (params.scope === "provider") {
		await invalidateProvider(params.providerId)
		return
	}
	if (params.scope === "product") {
		await Promise.all([invalidateProduct(params.scopeId), invalidateProvider(params.providerId)])
		return
	}
	if (params.scope === "variant") {
		const variant = await variantManagementRepository.getVariantById(params.scopeId)
		await Promise.all([
			variant ? invalidateProduct(variant.productId) : Promise.resolve(),
			invalidatePricing({
				variantId: params.scopeId,
				productId: variant?.productId ?? null,
				providerId: params.providerId,
			}),
		])
		return
	}
	const ratePlan = await ratePlanRepository.get(params.scopeId)
	const variant = ratePlan
		? await variantManagementRepository.getVariantById(ratePlan.variantId)
		: null
	await invalidatePricing({
		ratePlanId: params.scopeId,
		variantId: ratePlan?.variantId ?? null,
		productId: variant?.productId ?? null,
		providerId: params.providerId,
	})
}

async function ensureScopeOwned(params: { providerId: string; scope: string; scopeId: string }) {
	if (params.scope === "provider") {
		if (params.scopeId !== params.providerId) throw new Error("Not found")
		return
	}
	if (params.scope === "product") {
		const owned = await productRepository.ensureProductOwnedByProvider(
			params.scopeId,
			params.providerId
		)
		if (!owned) throw new Error("Not found")
		return
	}
	if (params.scope === "variant") {
		const v = await variantManagementRepository.getVariantById(params.scopeId)
		if (!v) throw new Error("Not found")
		const owned = await productRepository.ensureProductOwnedByProvider(
			v.productId,
			params.providerId
		)
		if (!owned) throw new Error("Not found")
		return
	}
	if (params.scope === "rate_plan") {
		const rp = await ratePlanRepository.get(params.scopeId)
		if (!rp) throw new Error("Not found")
		const v = await variantManagementRepository.getVariantById(rp.variantId)
		if (!v) throw new Error("Not found")
		const owned = await productRepository.ensureProductOwnedByProvider(
			v.productId,
			params.providerId
		)
		if (!owned) throw new Error("Not found")
		return
	}
	throw new Error("Invalid scope")
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const url = new URL(request.url)
		const parsed = listSchema.parse({
			scope: url.searchParams.get("scope") ?? "",
			scopeId: url.searchParams.get("scopeId") ?? "",
		})

		await ensureScopeOwned({
			providerId,
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})

		const { assignments } = await listTaxFeeAssignmentsByScopeUseCase({
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})
		const warnings = buildTaxFeeWarnings(assignments.map((a) => a.definition))

		const payload = assignments.map((a) => ({
			id: a.id,
			scope: a.scope,
			scopeId: a.scopeId,
			channel: a.channel,
			status: a.status,
			definition: {
				id: a.definition.id,
				code: a.definition.code,
				name: a.definition.name,
				kind: a.definition.kind,
				calculationType: a.definition.calculationType,
				value: a.definition.value,
				currency: a.definition.currency,
				inclusionType: a.definition.inclusionType,
				appliesPer: a.definition.appliesPer,
				priority: a.definition.priority,
				effectiveFrom: a.definition.effectiveFrom,
				effectiveTo: a.definition.effectiveTo,
				status: a.definition.status,
			},
		}))

		return new Response(JSON.stringify({ assignments: payload, warnings }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status = msg === "Not found" ? 404 : 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)

		const form = await request.formData()
		const parsed = assignSchema.parse({
			taxFeeDefinitionId: form.get("taxFeeDefinitionId"),
			scope: form.get("scope"),
			scopeId: form.get("scopeId"),
			channel: form.get("channel"),
			effectiveFrom: form.get("effectiveFrom") || null,
			effectiveTo: form.get("effectiveTo") || null,
		})
		const effectiveFrom = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : null
		const effectiveTo = parsed.effectiveTo ? new Date(parsed.effectiveTo) : null
		if (effectiveFrom && effectiveTo && effectiveFrom >= effectiveTo) {
			throw new Error("The assignment start must be before its end")
		}

		await ensureScopeOwned({
			providerId,
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})

		const result = await assignTaxFeeUseCase({
			taxFeeDefinitionId: parsed.taxFeeDefinitionId,
			scope: parsed.scope,
			scopeId: parsed.scopeId,
			channel: parsed.channel ?? null,
			effectiveFrom,
			effectiveTo,
		})

		const { assignments } = await listTaxFeeAssignmentsByScopeUseCase({
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})
		const warnings = buildTaxFeeWarnings(assignments.map((a) => a.definition))
		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action: "tax_fee_assignment_created",
			entityType: "TaxFeeDefinition",
			entityId: parsed.taxFeeDefinitionId,
			beforeJson: null,
			afterJson: {
				assignmentId: result.id,
				scope: parsed.scope,
				scopeId: parsed.scopeId,
				channel: parsed.channel ?? null,
				status: "active",
				effectiveFrom,
				effectiveTo,
			},
			riskLevel: "high",
		})
		await invalidateTaxFeeAssignmentCaches({
			providerId,
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})

		return new Response(JSON.stringify({ id: result.id, warnings }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		const status = msg.includes("Duplicate") ? 409 : msg === "Not found" ? 404 : 400
		return new Response(JSON.stringify({ error: "validation_error", message: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const PUT: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)
		const form = await request.formData()
		const parsed = updateAssignmentSchema.parse({
			assignmentId: form.get("assignmentId"),
			status: form.get("status"),
		})
		const existing = await db
			.select({
				id: TaxFeeAssignment.id,
				taxFeeDefinitionId: TaxFeeAssignment.taxFeeDefinitionId,
				scope: TaxFeeAssignment.scope,
				scopeId: TaxFeeAssignment.scopeId,
				channel: TaxFeeAssignment.channel,
				status: TaxFeeAssignment.status,
				providerId: TaxFeeDefinition.providerId,
			})
			.from(TaxFeeAssignment)
			.innerJoin(TaxFeeDefinition, eq(TaxFeeAssignment.taxFeeDefinitionId, TaxFeeDefinition.id))
			.where(eq(TaxFeeAssignment.id, parsed.assignmentId))
			.then((rows) => rows[0] ?? null)
		if (!existing || existing.providerId !== providerId) throw new Error("Not found")

		await db
			.update(TaxFeeAssignment)
			.set({ status: parsed.status })
			.where(eq(TaxFeeAssignment.id, parsed.assignmentId))
		await invalidateTaxFeeAssignmentCaches({
			providerId,
			scope: existing.scope as "product" | "variant" | "rate_plan" | "provider",
			scopeId: String(existing.scopeId ?? providerId),
		})
		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action:
				parsed.status === "active" ? "tax_fee_assignment_reactivated" : "tax_fee_assignment_paused",
			entityType: "TaxFeeDefinition",
			entityId: existing.taxFeeDefinitionId,
			beforeJson: existing,
			afterJson: { ...existing, status: parsed.status },
			riskLevel: "high",
		})
		return new Response(JSON.stringify({ id: existing.id, status: parsed.status }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = String(err?.message || "Unknown error")
		return new Response(
			JSON.stringify({ error: msg === "Not found" ? "not_found" : "validation_error" }),
			{
				status: msg === "Not found" ? 404 : 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
