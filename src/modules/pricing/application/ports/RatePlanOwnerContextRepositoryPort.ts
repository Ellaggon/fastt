export type RatePlanOwnerContext = {
	ratePlanId: string
	variantId: string
	productId: string
}

export interface RatePlanOwnerContextRepositoryPort {
	getOwnerContext(ratePlanId: string): Promise<RatePlanOwnerContext | null>
}
