import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function listAssignedPolicies(
	deps: { queryRepo: PolicyQueryRepositoryPort },
	params: { scopeId: string; category?: string | null }
) {
	return deps.queryRepo.listAssignedPoliciesByScope(params.scopeId, params.category)
}
