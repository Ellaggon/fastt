import type { ProductServiceQueryRepositoryPort } from "../ports/ProductServiceQueryRepositoryPort"

export function createListProductServiceConfigsQuery(deps: {
	repo: ProductServiceQueryRepositoryPort
}) {
	return async function listProductServiceConfigs(productId: string) {
		if (!productId) return []
		return deps.repo.listServiceConfigs(productId)
	}
}
