import type { CancellationPolicyRepositoryPort } from "../ports/CancellationPolicyRepositoryPort"

export function createListActiveCancellationPoliciesQuery(deps: {
	repo: CancellationPolicyRepositoryPort
}) {
	return async function listActiveCancellationPolicies() {
		return deps.repo.listActiveCancellationPolicies()
	}
}
