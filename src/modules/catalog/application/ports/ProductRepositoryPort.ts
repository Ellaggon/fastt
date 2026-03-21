import type { ProductBundle, ProductRow } from "../../domain/product.types"

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

	// Read APIs used by SSR/admin pages (queries). Kept on the same port to avoid parallel persistence layers.
	getProductById(productId: string): Promise<ProductRow | null | undefined>
	getProductWithImagesAndSubtype(productId: string): Promise<ProductBundle | null>
}
