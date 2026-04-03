import { RatePlanEngine } from "../../domain/rate-plans/RatePlanEngine"
import type { SelectedRatePlan } from "../../domain/rate-plans/ratePlan.types"
import type { PriceRuleRepositoryPort } from "../ports/PriceRuleRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"
import type { VariantRepositoryPort } from "../ports/VariantRepositoryPort"

export interface SelectBestRatePlanDeps {
	variantRepo: VariantRepositoryPort
	ratePlanRepo: RatePlanRepositoryPort
	priceRuleRepo: PriceRuleRepositoryPort
	ratePlanEngine: RatePlanEngine
}

export async function selectBestRatePlan(
	deps: SelectBestRatePlanDeps,
	params: {
		variantId: string
		checkIn: Date
		// Present for parity with callers; current selection is check-in based.
		checkOut: Date
	}
): Promise<{ best: SelectedRatePlan | null; candidates: SelectedRatePlan[] }> {
	const variant = await deps.variantRepo.getById(params.variantId)

	if (!variant) {
		throw new Error("Variant not found")
	}

	const ratePlans = await deps.ratePlanRepo.getActiveByVariant(params.variantId)

	if (!ratePlans.length) {
		return { best: null, candidates: [] }
	}

	const priceRules = await Promise.all(ratePlans.map((rp) => deps.priceRuleRepo.getActive(rp.id)))

	const candidates = deps.ratePlanEngine.selectFromMemory({
		ratePlans,
		priceRules,
		basePrice: variant.pricing.basePrice,
		checkIn: params.checkIn,
	})

	return { best: candidates[0] ?? null, candidates }
}
