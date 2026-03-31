export type PricingBaseRateSnapshot = {
	variantId: string
	currency: string
	basePrice: number
	createdAt: Date
}

export interface BaseRateRepositoryPort {
	getByVariantId(variantId: string): Promise<PricingBaseRateSnapshot | null>
	upsert(params: { variantId: string; currency: string; basePrice: number }): Promise<void>
}
