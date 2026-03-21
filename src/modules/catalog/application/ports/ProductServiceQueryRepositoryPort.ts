export type ProductServiceLinkRow = { serviceId: string; productServiceId: string }

export type ProductServiceAttributeRow = {
	id: string
	productServiceId: string
	key: string
	value: string
}

export type ProductServiceConfigRow = {
	serviceId: string
	productServiceId: string
	price: number | null
	priceUnit: string | null
	currency: string | null
	appliesTo: string
	notes: string | null
}

export interface ProductServiceQueryRepositoryPort {
	listServiceLinks(productId: string): Promise<ProductServiceLinkRow[]>
	listServiceConfigs(productId: string): Promise<ProductServiceConfigRow[]>
	getServiceConfig(params: {
		productId: string
		serviceId: string
	}): Promise<ProductServiceConfigRow | null>
	listAttributesByProductServiceIds(
		productServiceIds: string[]
	): Promise<ProductServiceAttributeRow[]>
}
