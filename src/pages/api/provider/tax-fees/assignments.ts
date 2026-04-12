import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	assignTaxFeeUseCase,
	listTaxFeeAssignmentsByScopeUseCase,
} from "@/container/taxes-fees.container"
import { productRepository, ratePlanRepository, variantManagementRepository } from "@/container"
import { buildTaxFeeWarnings } from "@/modules/taxes-fees/public"

const listSchema = z.object({
	scope: z.enum(["product", "variant", "rate_plan", "provider"]),
	scopeId: z.string().min(1),
})

const assignSchema = z.object({
	taxFeeDefinitionId: z.string().min(1),
	scope: z.enum(["product", "variant", "rate_plan", "provider"]),
	scopeId: z.string().min(1),
	channel: z.string().optional().nullable(),
})

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
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = assignSchema.parse({
			taxFeeDefinitionId: form.get("taxFeeDefinitionId"),
			scope: form.get("scope"),
			scopeId: form.get("scopeId"),
			channel: form.get("channel"),
		})

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
		})

		const { assignments } = await listTaxFeeAssignmentsByScopeUseCase({
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})
		const warnings = buildTaxFeeWarnings(assignments.map((a) => a.definition))

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
