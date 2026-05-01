export type CanonicalBaseRateSnapshot = {
	ratePlanId: string
	currency: string
	basePrice: number
	createdAt: Date
	variantId?: string
}

export interface BaseRateRepositoryPort {
	getCanonicalBaseByRatePlanId(ratePlanId: string): Promise<CanonicalBaseRateSnapshot | null>
	setCanonicalBaseForRatePlan(params: {
		ratePlanId: string
		currency: string
		basePrice: number
	}): Promise<void>

	/**
	 * @deprecated Temporary compatibility adapter while callers migrate to ratePlanId.
	 */
	getCanonicalBaseByVariantId(variantId: string): Promise<CanonicalBaseRateSnapshot | null>
	/**
	 * @deprecated Temporary compatibility adapter while callers migrate to ratePlanId.
	 */
	setCanonicalBaseForVariant(params: {
		variantId: string
		currency: string
		basePrice: number
	}): Promise<void>
}
