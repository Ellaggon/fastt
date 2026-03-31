import type {
	PolicyCommandRepositoryPort,
	CreatePolicyVersionParams,
} from "../ports/PolicyCommandRepositoryPort"

export async function createPolicyVersion(
	deps: { commandRepo: PolicyCommandRepositoryPort },
	params: CreatePolicyVersionParams
) {
	return deps.commandRepo.createPolicyVersion(params)
}
