import type { PolicyCommandRepositoryPort } from "../ports/PolicyCommandRepositoryPort"

export async function assignPolicyGroup(
	deps: { commandRepo: PolicyCommandRepositoryPort },
	params: { groupId: string; scopeId: string }
) {
	await deps.commandRepo.assignPolicyGroup(params)
}
