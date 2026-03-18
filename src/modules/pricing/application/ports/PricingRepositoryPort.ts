import type { AppliedPriceRule } from "@/core/pricing/pricing.types"

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
