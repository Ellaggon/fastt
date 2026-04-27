export type RatePlanOwnerContext = {
	ratePlanId: string
	variantId: string
	productId: string
	providerId: string | null
}

export interface RatePlanOwnerContextRepositoryPort {
	getOwnerContext(ratePlanId: string): Promise<RatePlanOwnerContext | null>
}
