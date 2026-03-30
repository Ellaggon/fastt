export type RatePlanListItemByProduct = {
	id: string
	variantId: string
	isDefault: boolean
	isActive: boolean
	templateId: string
	templateName: string
}

export interface RatePlanListByProductRepositoryPort {
	listByProduct(productId: string): Promise<RatePlanListItemByProduct[]>
}
