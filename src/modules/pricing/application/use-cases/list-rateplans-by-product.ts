import type {
	RatePlanListByProductRepositoryPort,
	RatePlanListItemByProduct,
} from "../ports/RatePlanListByProductRepositoryPort"

export async function listRatePlansByProduct(
	deps: { repo: RatePlanListByProductRepositoryPort },
	params: { productId: string }
): Promise<RatePlanListItemByProduct[]> {
	if (!params.productId) return []
	return deps.repo.listByProduct(params.productId)
}
