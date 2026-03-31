import type { RatePlanQueryRepositoryPort } from "../ports/RatePlanQueryRepositoryPort"

export function createListRatePlansByVariantQuery(deps: { repo: RatePlanQueryRepositoryPort }) {
	return async function listRatePlansByVariant(variantId: string) {
		if (!variantId) return []
		return deps.repo.listByVariant(variantId)
	}
}

export function createGetRatePlanByIdQuery(deps: { repo: RatePlanQueryRepositoryPort }) {
	return async function getRatePlanById(ratePlanId: string) {
		if (!ratePlanId) return null
		return deps.repo.getById(ratePlanId)
	}
}
