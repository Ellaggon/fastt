import type {
	CatalogProductAggregate,
	CatalogReadModelRepositoryPort,
} from "../ports/CatalogReadModelRepositoryPort"

export function createGetProductAggregateQuery(deps: { repo: CatalogReadModelRepositoryPort }) {
	return async function getProductAggregate(
		productId: string
	): Promise<CatalogProductAggregate | null> {
		if (!productId) return null
		return deps.repo.getProductAggregate(productId)
	}
}
