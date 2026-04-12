import type { ProviderV2RepositoryPort } from "../../ports/ProviderV2RepositoryPort"
import { providerIdentitySchema } from "@/schemas/provider"
import { ValidationError } from "@/lib/validation/ValidationError"

export async function registerProviderV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		sessionEmail: string
		legalName?: string | null
		displayName?: string | null
	}
): Promise<{ providerId: string; created: boolean }> {
	const result = providerIdentitySchema.safeParse({
		legalName: params.legalName ?? undefined,
		displayName: params.displayName ?? undefined,
	})
	if (!result.success) {
		throw new ValidationError(result.error)
	}
	const parsed = result.data

	const providerId = crypto.randomUUID()

	return deps.repo.registerProvider({
		provider: {
			id: providerId,
			legalName: parsed.legalName,
			displayName: parsed.displayName,
			status: "draft",
		},
		userEmailForLink: params.sessionEmail,
		role: "owner",
	})
}
