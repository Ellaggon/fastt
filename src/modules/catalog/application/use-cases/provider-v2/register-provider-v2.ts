import type { ProviderV2RepositoryPort } from "../../ports/ProviderV2RepositoryPort"
import { registerProviderSchema } from "../../schemas/provider-v2/registerProviderSchema"

export async function registerProviderV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		sessionEmail: string
		companyName: string
		legalName?: string | null
		displayName?: string | null
		contactName?: string | null
		contactEmail?: string | null
		phone?: string | null
		type?: string | null
	}
): Promise<{ providerId: string; created: boolean }> {
	const parsed = registerProviderSchema.parse({
		companyName: params.companyName,
		legalName: params.legalName ?? undefined,
		displayName: params.displayName ?? undefined,
		contactName: params.contactName ?? undefined,
		contactEmail: params.contactEmail ?? undefined,
		phone: params.phone ?? undefined,
		type: params.type ?? undefined,
	})

	const providerId = crypto.randomUUID()

	return deps.repo.registerProvider({
		provider: {
			id: providerId,
			userEmail: params.sessionEmail,
			companyName: parsed.companyName,
			legalName: parsed.legalName,
			displayName: parsed.displayName,
			contactName: parsed.contactName ?? null,
			contactEmail: parsed.contactEmail ?? null,
			phone: parsed.phone ?? null,
			type: parsed.type ?? null,
			status: "draft",
		},
		userEmailForLink: params.sessionEmail,
		role: "owner",
	})
}
