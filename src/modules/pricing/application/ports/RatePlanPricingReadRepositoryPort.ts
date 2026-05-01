export interface RatePlanPricingReadRepositoryPort {
	getDefaultRatePlanPricingSummaryByVariant(variantId: string): Promise<{
		ratePlanId: string
		currency: string
		basePrice: number
		effectivePricingDays: number
		coverageOccupancyKey: string
	} | null>

	getRatePlanPricingSummary(ratePlanId: string): Promise<{
		ratePlanId: string
		currency: string
		basePrice: number
		effectivePricingDays: number
		coverageOccupancyKey: string
	} | null>
}
