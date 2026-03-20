import type { AppliedPriceRule } from "../../domain/pricing.types"

export interface PricingRepositoryPort {
	getRules(ratePlanId: string): Promise<AppliedPriceRule[]>
	saveEffectivePrice(params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
		finalBasePrice: number
	}): Promise<void>
}
