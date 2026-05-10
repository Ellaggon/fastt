export type CanonicalPricingBaselineSnapshot = {
	ratePlanId: string
	currency: string
	basePrice: number
	createdAt: Date
}

export interface RatePlanPricingBaselineRepositoryPort {
	getCanonicalPricingBaselineByRatePlanId(
		ratePlanId: string
	): Promise<CanonicalPricingBaselineSnapshot | null>
	setCanonicalPricingBaselineForRatePlan(params: {
		ratePlanId: string
		currency: string
		basePrice: number
	}): Promise<void>
}
