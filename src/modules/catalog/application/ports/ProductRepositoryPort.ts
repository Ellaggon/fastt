export interface CreateProductParams {
	id: string
	name: string
	description: string | null
	productType: string
	providerId: string | null
	destinationId: string
	images: string[]
}

export interface ProductRepositoryPort {
	createProductWithImages(params: CreateProductParams): Promise<void>
}
