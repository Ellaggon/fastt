import type { PolicyCommandRepositoryPort } from "../ports/PolicyCommandRepositoryPort"

export async function deleteDraftPolicy(
	deps: { commandRepo: PolicyCommandRepositoryPort },
	params: { policyId: string }
) {
	await deps.commandRepo.deleteDraftPolicy(params)
}
