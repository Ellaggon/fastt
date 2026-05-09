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

/**
 * @deprecated Use CanonicalPricingBaselineSnapshot.
 */
export type CanonicalBaseRateSnapshot = CanonicalPricingBaselineSnapshot

/**
 * @deprecated Use RatePlanPricingBaselineRepositoryPort.
 */
export interface BaseRateRepositoryPort extends RatePlanPricingBaselineRepositoryPort {
	getCanonicalBaseByRatePlanId(ratePlanId: string): Promise<CanonicalBaseRateSnapshot | null>
	setCanonicalBaseForRatePlan(params: {
		ratePlanId: string
		currency: string
		basePrice: number
	}): Promise<void>
}
