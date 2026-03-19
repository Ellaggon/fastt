import type {
	PolicyCommandRepositoryPort,
	CreatePolicyParams,
} from "../ports/PolicyCommandRepositoryPort"

export async function createPolicy(
	deps: { commandRepo: PolicyCommandRepositoryPort },
	params: CreatePolicyParams
) {
	return deps.commandRepo.createPolicy(params)
}
