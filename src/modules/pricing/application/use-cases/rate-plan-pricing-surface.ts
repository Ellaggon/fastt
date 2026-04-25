import type {
	RatePlanPricingContext,
	RatePlanPricingContextRepositoryPort,
} from "../ports/RatePlanPricingContextRepositoryPort"

export type { RatePlanPricingContext }

export function createResolveRatePlanPricingContext(deps: {
	repo: RatePlanPricingContextRepositoryPort
}) {
	return async function resolveRatePlanPricingContext(params: {
		providerId: string
		ratePlanId: string
	}): Promise<RatePlanPricingContext | null> {
		return deps.repo.resolveRatePlanPricingContext(params)
	}
}
