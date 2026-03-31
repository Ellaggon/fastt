import type {
	RatePlanOwnerContext,
	RatePlanOwnerContextRepositoryPort,
} from "../ports/RatePlanOwnerContextRepositoryPort"

export async function getRatePlanOwnerContext(
	deps: { repo: RatePlanOwnerContextRepositoryPort },
	params: { ratePlanId: string }
): Promise<RatePlanOwnerContext | null> {
	if (!params.ratePlanId) return null
	return deps.repo.getOwnerContext(params.ratePlanId)
}
