import type { PolicyCommandRepositoryPort } from "../ports/PolicyCommandRepositoryPort"

export async function unassignPolicyGroup(
	deps: { commandRepo: PolicyCommandRepositoryPort },
	params: { groupId: string; scopeId: string }
) {
	await deps.commandRepo.unassignPolicyGroup(params)
}
