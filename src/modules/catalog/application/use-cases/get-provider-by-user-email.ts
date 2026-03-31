import type { ProviderRepositoryPort } from "../ports/ProviderRepositoryPort"

export async function getProviderByUserEmail(
	deps: { repo: ProviderRepositoryPort },
	params: { email: string }
) {
	return deps.repo.getProviderByEmail(params.email)
}
