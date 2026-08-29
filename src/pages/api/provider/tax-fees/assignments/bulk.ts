import type { APIRoute } from "astro"
import { z, ZodError } from "zod"

import { requireProviderFiscalityManager } from "@/lib/provider-fiscality-auth"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { invalidateProduct, invalidateProvider, invalidatePricing } from "@/lib/cache/invalidation"
import { invalidateAggregateCache } from "@/lib/cache/ssrAggregateCache"
import { productRepository, ratePlanRepository, variantManagementRepository } from "@/container"
import {
	db,
	and,
	eq,
	isNull,
	TaxFeeAssignment,
	TaxFeeDefinition,
} from "@/shared/infrastructure/db/compat"
import { typedAssignmentTarget } from "@/shared/domain/assignment-target"

const scopeSchema = z.enum(["provider", "product", "variant", "rate_plan"])
const targetSchema = z.object({
	scope: scopeSchema,
	scopeId: z.string().min(1),
	channel: z.string().nullable().optional(),
	assignmentId: z.string().optional(),
	effectiveFrom: z.string().datetime().nullable().optional(),
	effectiveTo: z.string().datetime().nullable().optional(),
})
const schema = z
	.object({
		operation: z.enum(["assign", "pause", "inherit", "preview"]),
		taxFeeDefinitionId: z.string().min(1).optional(),
		targets: z.array(targetSchema).min(1).max(100),
	})
	.superRefine((value, ctx) => {
		if (
			(value.operation === "assign" || value.operation === "preview") &&
			!value.taxFeeDefinitionId
		) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A rule is required" })
		}
		if (
			(value.operation === "pause" || value.operation === "inherit") &&
			value.targets.some((target) => !target.assignmentId)
		) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An assignment is required" })
		}
	})

async function ensureOwned(
	providerId: string,
	scope: z.infer<typeof scopeSchema>,
	scopeId: string
) {
	if (scope === "provider") {
		if (scopeId !== providerId) throw new Error("Not found")
		return
	}
	if (scope === "product") {
		if (!(await productRepository.ensureProductOwnedByProvider(scopeId, providerId)))
			throw new Error("Not found")
		return
	}
	if (scope === "variant") {
		const variant = await variantManagementRepository.getVariantById(scopeId)
		if (
			!variant ||
			!(await productRepository.ensureProductOwnedByProvider(variant.productId, providerId))
		)
			throw new Error("Not found")
		return
	}
	const ratePlan = await ratePlanRepository.get(scopeId)
	const variant = ratePlan
		? await variantManagementRepository.getVariantById(ratePlan.variantId)
		: null
	if (
		!variant ||
		!(await productRepository.ensureProductOwnedByProvider(variant.productId, providerId))
	)
		throw new Error("Not found")
}

async function invalidate(providerId: string, scope: z.infer<typeof scopeSchema>, scopeId: string) {
	if (scope === "provider") return invalidateProvider(providerId)
	if (scope === "product")
		return Promise.all([invalidateProduct(scopeId), invalidateProvider(providerId)])
	if (scope === "variant") {
		const variant = await variantManagementRepository.getVariantById(scopeId)
		return invalidatePricing({
			variantId: scopeId,
			productId: variant?.productId ?? null,
			providerId,
		})
	}
	const ratePlan = await ratePlanRepository.get(scopeId)
	const variant = ratePlan
		? await variantManagementRepository.getVariantById(ratePlan.variantId)
		: null
	return invalidatePricing({
		ratePlanId: scopeId,
		variantId: ratePlan?.variantId ?? null,
		productId: variant?.productId ?? null,
		providerId,
	})
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { providerId, user } = await requireProviderFiscalityManager(request)
		const input = schema.parse(await request.json())
		for (const target of input.targets) {
			if (
				target.effectiveFrom &&
				target.effectiveTo &&
				new Date(target.effectiveFrom) >= new Date(target.effectiveTo)
			) {
				throw new Error("The assignment start must be before its end")
			}
			await ensureOwned(providerId, target.scope, target.scopeId)
		}
		if (input.operation === "assign" || input.operation === "preview") {
			const definition = await db
				.select()
				.from(TaxFeeDefinition)
				.where(eq(TaxFeeDefinition.id, input.taxFeeDefinitionId!))
				.then((rows) => rows[0] ?? null)
			if (
				!definition ||
				definition.providerId !== providerId ||
				definition.status !== "active" ||
				definition.editingState === "draft" ||
				!/^[A-Za-z]{2}$/.test(
					String((definition.jurisdictionJson as { country?: string } | null)?.country ?? "")
				)
			)
				throw new Error("Not found")
		}
		if (input.operation === "preview") {
			const findings = await Promise.all(
				input.targets.map(async (target) => {
					const existing = await db
						.select({
							definitionId: TaxFeeAssignment.taxFeeDefinitionId,
							definitionName: TaxFeeDefinition.name,
						})
						.from(TaxFeeAssignment)
						.innerJoin(
							TaxFeeDefinition,
							eq(TaxFeeAssignment.taxFeeDefinitionId, TaxFeeDefinition.id)
						)
						.where(
							and(
								eq(TaxFeeDefinition.providerId, providerId),
								eq(TaxFeeAssignment.scope, target.scope),
								eq(TaxFeeAssignment.scopeId, target.scopeId),
								target.channel
									? eq(TaxFeeAssignment.channel, target.channel)
									: isNull(TaxFeeAssignment.channel),
								eq(TaxFeeAssignment.status, "active")
							)
						)
					const duplicate = existing.some(
						(assignment) => assignment.definitionId === input.taxFeeDefinitionId
					)
					const existingNames = existing
						.filter((assignment) => assignment.definitionId !== input.taxFeeDefinitionId)
						.map((assignment) => assignment.definitionName)
					return {
						target: { scope: target.scope, scopeId: target.scopeId },
						duplicate,
						existingNames,
					}
				})
			)
			const blockers = findings
				.filter((finding) => finding.duplicate)
				.map(
					(finding) =>
						`La regla ya está asignada directamente en ${finding.target.scope} ${finding.target.scopeId}.`
				)
			const warnings = findings
				.filter((finding) => finding.existingNames.length > 0)
				.map(
					(finding) =>
						`Se acumulará con ${finding.existingNames.join(", ")} en ${finding.target.scope} ${finding.target.scopeId}.`
				)
			return Response.json({
				canApply: blockers.length === 0,
				blockers,
				warnings,
			})
		}

		const result = await db.transaction(async (tx) => {
			if (input.operation === "assign") {
				for (const target of input.targets) {
					const existing = await tx
						.select({ id: TaxFeeAssignment.id })
						.from(TaxFeeAssignment)
						.where(
							and(
								eq(TaxFeeAssignment.taxFeeDefinitionId, input.taxFeeDefinitionId!),
								eq(TaxFeeAssignment.scope, target.scope),
								eq(TaxFeeAssignment.scopeId, target.scopeId),
								target.channel
									? eq(TaxFeeAssignment.channel, target.channel)
									: isNull(TaxFeeAssignment.channel),
								eq(TaxFeeAssignment.status, "active")
							)
						)
						.then((rows) => rows[0] ?? null)
					if (existing) throw new Error("Duplicate active assignment")
				}
				const ids = input.targets.map(() => crypto.randomUUID())
				await tx.insert(TaxFeeAssignment).values(
					input.targets.map((target, index) => ({
						id: ids[index],
						taxFeeDefinitionId: input.taxFeeDefinitionId!,
						scope: target.scope,
						...typedAssignmentTarget(target.scope, target.scopeId),
						channel: target.channel ?? null,
						status: "active",
						effectiveFrom: target.effectiveFrom ? new Date(target.effectiveFrom) : null,
						effectiveTo: target.effectiveTo ? new Date(target.effectiveTo) : null,
						createdAt: new Date(),
					}))
				)
				return ids
			}
			const ids = input.targets.map((target) => target.assignmentId!)
			const owned = await tx
				.select({ id: TaxFeeAssignment.id, definitionId: TaxFeeAssignment.taxFeeDefinitionId })
				.from(TaxFeeAssignment)
				.innerJoin(TaxFeeDefinition, eq(TaxFeeAssignment.taxFeeDefinitionId, TaxFeeDefinition.id))
				.where(eq(TaxFeeDefinition.providerId, providerId))
			if (owned.filter((item) => ids.includes(item.id)).length !== ids.length)
				throw new Error("Not found")
			await Promise.all(
				ids.map((id) =>
					tx.update(TaxFeeAssignment).set({ status: "archived" }).where(eq(TaxFeeAssignment.id, id))
				)
			)
			return ids
		})

		await Promise.all(
			input.targets.map((target, index) =>
				Promise.all([
					invalidate(providerId, target.scope, target.scopeId),
					writeProviderAuditLog({
						providerId,
						actorUserId: user.id,
						action: `tax_fee_assignment_bulk_${input.operation}`,
						entityType: "TaxFeeDefinition",
						entityId: input.taxFeeDefinitionId ?? target.assignmentId!,
						beforeJson: input.operation === "assign" ? null : { assignmentId: target.assignmentId },
						afterJson: {
							assignmentId: result[index],
							scope: target.scope,
							scopeId: target.scopeId,
							channel: target.channel ?? null,
						},
						riskLevel: "high",
					}),
				])
			)
		)
		invalidateAggregateCache({ providerId })
		return Response.json({ ids: result }, { status: 200 })
	} catch (error: any) {
		if (error instanceof ZodError)
			return Response.json({ error: "validation_error", details: error.issues }, { status: 400 })
		const message = String(error?.message ?? "Unknown error")
		return Response.json(
			{
				error: message.includes("Duplicate") ? "duplicate_assignment" : "validation_error",
				message,
			},
			{ status: message === "Not found" ? 404 : message.includes("Duplicate") ? 409 : 400 }
		)
	}
}
