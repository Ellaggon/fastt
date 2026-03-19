import { PricingEngine } from "@/modules/pricing/domain/PricingEngine"
import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"

export interface ComputeAndPersistDailyPriceDeps {
	pricingRepo: PricingRepositoryPort
	pricingEngine: PricingEngine
}

export async function computeAndPersistDailyPrice(
	deps: ComputeAndPersistDailyPriceDeps,
	params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
	}
) {
	const rules = await deps.pricingRepo.getRules(params.ratePlanId)

	const result = deps.pricingEngine.computeDaily({
		basePrice: params.basePrice,
		rules,
		currency: "USD",
	})

	await deps.pricingRepo.saveEffectivePrice({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		date: params.date,
		basePrice: params.basePrice,
		finalBasePrice: result.total,
	})
}
