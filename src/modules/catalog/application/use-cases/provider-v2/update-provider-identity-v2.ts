import type { ProviderV2RepositoryPort } from "../../ports/ProviderV2RepositoryPort"
import { providerIdentitySchema } from "@/schemas/provider"
import { ValidationError } from "@/lib/validation/ValidationError"

export async function updateProviderIdentityV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		providerId: string
		legalName: string
		displayName: string
	}
): Promise<{ providerId: string }> {
	const result = providerIdentitySchema.safeParse({
		legalName: params.legalName,
		displayName: params.displayName,
	})
	if (!result.success) {
		throw new ValidationError(result.error)
	}
	const parsed = result.data

	if (!deps.repo.updateProviderIdentity) {
		throw new Error("Provider identity update is not supported by repository")
	}

	await deps.repo.updateProviderIdentity({
		providerId: params.providerId,
		legalName: parsed.legalName ?? null,
		displayName: parsed.displayName ?? null,
	})

	return { providerId: params.providerId }
}
