import type { ProductRepositoryPort } from "../ports/ProductRepositoryPort"

export function createGetProductByIdQuery(deps: { repo: ProductRepositoryPort }) {
	return async function getProductById(productId: string) {
		if (!productId) return null
		return deps.repo.getProductById(productId)
	}
}
