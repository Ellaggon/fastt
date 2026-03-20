import type { EffectivePolicyRepositoryPort } from "../ports/EffectivePolicyRepositoryPort"

export function createResolveHotelPoliciesQuery(deps: { repo: EffectivePolicyRepositoryPort }) {
	return async function resolveHotelPolicies(productId: string) {
		return deps.repo.listByProduct(productId)
	}
}
