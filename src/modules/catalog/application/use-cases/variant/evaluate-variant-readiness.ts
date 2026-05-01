import type {
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import type { RatePlanPricingReadRepositoryPort } from "@/modules/pricing/application/ports"
import { evaluateVariantReadinessSchema } from "../../schemas/variant/variantSchemas"

type ValidationError = { code: string; message: string }

export async function evaluateVariantReadiness(
	deps: {
		repo: VariantManagementRepositoryPort
		pricingReadRepo: RatePlanPricingReadRepositoryPort
	},
	params: { variantId: string }
): Promise<{ variantId: string; state: "draft" | "ready"; validationErrors: ValidationError[] }> {
	const parsed = evaluateVariantReadinessSchema.parse(params)

	const v = await deps.repo.getVariantById(parsed.variantId)
	if (!v) throw new Error("Variant not found")

	const blockingErrors: ValidationError[] = []
	const allErrors: ValidationError[] = []

	const capacity = await deps.repo.getCapacity(parsed.variantId)
	if (!capacity) {
		const e = { code: "missing_capacity", message: "Capacity is required" }
		blockingErrors.push(e)
		allErrors.push(e)
	}

	// CAPA 4.6:
	// Room type is optional for now to avoid blocking environments without seed data.
	// Keep subtype out of blocking readiness until reference data setup is enforced.

	// Pricing summary is consumed from pricing read-model (catalog must not interpret pricing internals).
	const pricingSummary = await deps.pricingReadRepo.getDefaultRatePlanPricingSummaryByVariant(
		parsed.variantId
	)
	if (!pricingSummary) {
		allErrors.push({ code: "pricing_missing", message: "Pricing summary not configured" })
	}
	allErrors.push({
		code: "inventory_missing",
		message: "Inventory not configured (reserved for CAPA 5)",
	})

	const state: "draft" | "ready" = blockingErrors.length === 0 ? "ready" : "draft"

	await deps.repo.upsertReadiness({
		variantId: parsed.variantId,
		state,
		validationErrorsJson: allErrors,
	})

	// Keep lifecycle aligned for now: ready <-> draft. Sellable is handled separately later.
	const nextStatus: VariantLifecycleStatus = state === "ready" ? "ready" : "draft"
	await deps.repo.updateVariantStatus({
		variantId: parsed.variantId,
		status: nextStatus,
		isActive: state === "ready",
	})

	return { variantId: parsed.variantId, state, validationErrors: allErrors }
}
