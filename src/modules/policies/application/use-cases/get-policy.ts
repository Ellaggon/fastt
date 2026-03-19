import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function getPolicy(
	deps: { queryRepo: PolicyQueryRepositoryPort },
	params: { policyId: string }
) {
	const policy = await deps.queryRepo.getPolicyById(params.policyId)
	if (!policy) return null

	const tiers = await deps.queryRepo.listCancellationTiersByPolicyId(params.policyId)

	return {
		...policy,
		cancellationTiers: tiers,
	}
}
