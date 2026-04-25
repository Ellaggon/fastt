export type RatePlanPricingContext = {
	ratePlanId: string
	ratePlanName: string
	productId: string
	productName: string
	variantId: string
	variantName: string
}

export interface RatePlanPricingContextRepositoryPort {
	resolveRatePlanPricingContext(params: {
		providerId: string
		ratePlanId: string
	}): Promise<RatePlanPricingContext | null>
}
