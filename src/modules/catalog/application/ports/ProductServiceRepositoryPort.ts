export interface ProductServiceRepositoryPort {
	syncProductServices(params: {
		productId: string
		services: { serviceId: string }[]
	}): Promise<void>

	updateProductService(params: {
		psId: string
		price: number | null
		priceUnit: string | null
		currency: string | null
		appliesTo: string
		notes: string | undefined
		attributes: { key: string; value: string }[]
	}): Promise<void>

	deleteProductService(params: { productId: string; serviceId: string }): Promise<void>
}
