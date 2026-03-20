export type ProductServiceLinkRow = { serviceId: string; productServiceId: string }

export type ProductServiceAttributeRow = {
	id: string
	productServiceId: string
	key: string
	value: string
}

export interface ProductServiceQueryRepositoryPort {
	listServiceLinks(productId: string): Promise<ProductServiceLinkRow[]>
	listAttributesByProductServiceIds(
		productServiceIds: string[]
	): Promise<ProductServiceAttributeRow[]>
}
