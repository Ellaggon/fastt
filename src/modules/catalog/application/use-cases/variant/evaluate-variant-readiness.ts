import type {
	VariantLifecycleStatus,
	VariantManagementRepositoryPort,
} from "../../ports/VariantManagementRepositoryPort"
import { evaluateVariantReadinessSchema } from "../../schemas/variant/variantSchemas"

type ValidationError = { code: string; message: string }

function validateMinimalPricingRules(params: {
	basePrice: number
	rules: Array<{ id: string; type: string; value: number }>
}): { valid: boolean; reason?: string } {
	// Keep semantics aligned with CAPA 4B strict minimal rule model.
	for (const r of params.rules) {
		const type = String(r.type || "").trim()
		const value = Number(r.value)
		if (!Number.isFinite(value))
			return { valid: false, reason: `rule ${r.id}: value is not finite` }

		if (type === "percentage") {
			if (value < -100 || value > 1000) {
				return { valid: false, reason: `rule ${r.id}: percentage out of bounds` }
			}
			continue
		}

		if (type === "fixed") {
			// Prevent final price going negative (same as pricing engine constraints).
			if (value < -params.basePrice) {
				return { valid: false, reason: `rule ${r.id}: fixed discount exceeds base price` }
			}
			continue
		}

		return { valid: false, reason: `rule ${r.id}: invalid type '${type}'` }
	}

	return { valid: true }
}

export async function evaluateVariantReadiness(
	deps: { repo: VariantManagementRepositoryPort },
	params: { variantId: string }
): Promise<{ variantId: string; state: "draft" | "ready"; validationErrors: ValidationError[] }> {
	const parsed = evaluateVariantReadinessSchema.parse(params)

	const v = await deps.repo.getVariantById(parsed.variantId)
	if (!v) throw new Error("Variant not found")

	// "Ready" in CAPA 3 means: catalog complete (capacity + subtype).
	// We also emit forward-looking flags (pricing/inventory) without blocking readiness yet.
	const blockingErrors: ValidationError[] = []
	const allErrors: ValidationError[] = []

	const capacity = await deps.repo.getCapacity(parsed.variantId)
	if (!capacity) {
		const e = { code: "missing_capacity", message: "Capacity is required" }
		blockingErrors.push(e)
		allErrors.push(e)
	}

	const kind = String(v.kind ?? v.entityType ?? "").trim()
	if (kind === "hotel_room") {
		const subtype = await deps.repo.getHotelRoomSubtype(parsed.variantId)
		if (!subtype) {
			const e = { code: "missing_subtype", message: "Hotel room subtype is required" }
			blockingErrors.push(e)
			allErrors.push(e)
		}
	}

	// Future-layer flags (non-blocking until CAPA 4/5 exist).
	// CAPA 4A/4B: pricing readiness signals.
	const baseRate = await deps.repo.getBaseRate(parsed.variantId)
	if (!baseRate) {
		allErrors.push({ code: "pricing_missing", message: "Base rate not configured" })
	} else {
		const plan = await deps.repo.getDefaultRatePlanWithRules(parsed.variantId)
		if (!plan) {
			allErrors.push({ code: "no_default_rate_plan", message: "No default rate plan configured" })
		} else {
			if (plan.rules.length === 0) {
				allErrors.push({ code: "rules_empty", message: "No pricing rules configured" })
			}

			const check = validateMinimalPricingRules({
				basePrice: Number(baseRate.basePrice),
				rules: plan.rules.map((r) => ({ id: r.id, type: r.type, value: r.value })),
			})
			if (!check.valid) {
				allErrors.push({
					code: "pricing_invalid",
					message: check.reason || "Pricing rules invalid",
				})
			}
		}
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
