export type CanonicalBaseRateSnapshot = {
	ratePlanId: string
	currency: string
	basePrice: number
	createdAt: Date
}

export interface BaseRateRepositoryPort {
	getCanonicalBaseByRatePlanId(ratePlanId: string): Promise<CanonicalBaseRateSnapshot | null>
	setCanonicalBaseForRatePlan(params: {
		ratePlanId: string
		currency: string
		basePrice: number
	}): Promise<void>
}
