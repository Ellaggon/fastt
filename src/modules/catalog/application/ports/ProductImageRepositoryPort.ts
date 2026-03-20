export type ProductImageRow = { id: string; url: string; order: number; isPrimary: boolean }

export interface ProductImageRepositoryPort {
	listByProduct(productId: string): Promise<ProductImageRow[]>
	updateImage(id: string, patch: Record<string, unknown>): Promise<void>
	insertImage(params: {
		productId: string
		url: string
		order: number
		isPrimary: boolean
	}): Promise<void>
	deleteImage(id: string): Promise<void>
	listOrderedByProduct(productId: string): Promise<ProductImageRow[]>
	listGalleryByProduct(productId: string): Promise<ProductImageRow[]>
}
