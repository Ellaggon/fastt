import type { RatePlanQueryRepositoryPort } from "../ports/RatePlanQueryRepositoryPort"

export function createListRatePlansByVariantQuery(deps: { repo: RatePlanQueryRepositoryPort }) {
	return async function listRatePlansByVariant(variantId: string) {
		if (!variantId) return []
		return deps.repo.listByVariant(variantId)
	}
}

export function createListRatePlansByProviderQuery(deps: { repo: RatePlanQueryRepositoryPort }) {
	return async function listRatePlansByProvider(providerId: string) {
		if (!providerId) return []
		return deps.repo.listByProvider(providerId)
	}
}

export function createGetRatePlanByIdQuery(deps: { repo: RatePlanQueryRepositoryPort }) {
	return async function getRatePlanById(ratePlanId: string) {
		if (!ratePlanId) return null
		return deps.repo.getById(ratePlanId)
	}
}
