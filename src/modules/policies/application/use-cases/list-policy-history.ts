import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function listPolicyHistory(
	deps: { queryRepo: PolicyQueryRepositoryPort },
	params: { groupId: string }
) {
	return deps.queryRepo.listPolicyHistoryByGroupId(params.groupId)
}
