export type RatePlanListItemByProduct = {
	id: string
	variantId: string
	isDefault: boolean
	isActive: boolean
	name: string
	description?: string | null
}

export interface RatePlanListByProductRepositoryPort {
	listByProduct(productId: string): Promise<RatePlanListItemByProduct[]>
}
