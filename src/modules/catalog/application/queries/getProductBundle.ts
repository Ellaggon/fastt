import type { ProductRepositoryPort } from "../ports/ProductRepositoryPort"

export function createGetProductBundleQuery(deps: { repo: ProductRepositoryPort }) {
	return async function getProductBundle(productId: string) {
		if (!productId) return null
		return deps.repo.getProductWithImagesAndSubtype(productId)
	}
}
