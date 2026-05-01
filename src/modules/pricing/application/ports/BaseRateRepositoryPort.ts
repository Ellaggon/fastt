export type CanonicalBaseRateSnapshot = {
	variantId: string
	currency: string
	basePrice: number
	createdAt: Date
}

export interface BaseRateRepositoryPort {
	getCanonicalBaseByVariantId(variantId: string): Promise<CanonicalBaseRateSnapshot | null>
	setCanonicalBaseForVariant(params: {
		variantId: string
		currency: string
		basePrice: number
	}): Promise<void>
}
