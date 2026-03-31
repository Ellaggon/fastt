import type { ProviderV2RepositoryPort } from "../../ports/ProviderV2RepositoryPort"
import { providerProfileSchema } from "../../schemas/provider-v2/providerProfileSchema"

export async function upsertProviderProfileV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		sessionEmail: string
		timezone: string
		defaultCurrency: string
		supportEmail?: string | null
		supportPhone?: string | null
	}
): Promise<{ providerId: string }> {
	const parsed = providerProfileSchema.parse({
		timezone: params.timezone,
		defaultCurrency: params.defaultCurrency,
		supportEmail: params.supportEmail ?? undefined,
		supportPhone: params.supportPhone ?? undefined,
	})

	const providerId = await deps.repo.getProviderIdByUserEmail(params.sessionEmail)
	if (!providerId) {
		throw new Error("Provider not found for current user")
	}

	await deps.repo.upsertProfile({
		providerId,
		timezone: parsed.timezone,
		defaultCurrency: parsed.defaultCurrency,
		supportEmail: parsed.supportEmail ?? null,
		supportPhone: parsed.supportPhone ?? null,
	})

	return { providerId }
}
