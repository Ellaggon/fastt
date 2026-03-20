import type { ProductImageRepositoryPort } from "../ports/ProductImageRepositoryPort"

export function createResolveProductImagesQuery(deps: { repo: ProductImageRepositoryPort }) {
	return async function resolveProductImages(productId: string) {
		return deps.repo.listGalleryByProduct(productId)
	}
}
