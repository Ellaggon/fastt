import type { ProviderV2RepositoryPort } from "../../ports/ProviderV2RepositoryPort"
import { providerProfileSchema } from "@/schemas/provider"
import { ValidationError } from "@/lib/validation/ValidationError"

export async function upsertProviderProfileV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		providerId: string
		timezone: string
		defaultCurrency: string
		supportEmail?: string | null
		supportPhone?: string | null
	}
): Promise<{ providerId: string }> {
	const result = providerProfileSchema.safeParse({
		timezone: params.timezone,
		defaultCurrency: params.defaultCurrency,
		supportEmail: params.supportEmail ?? undefined,
		supportPhone: params.supportPhone ?? undefined,
	})
	if (!result.success) {
		throw new ValidationError(result.error)
	}
	const parsed = result.data

	const providerId = String(params.providerId || "").trim()
	if (!providerId) throw new Error("Provider not found for current user")

	await deps.repo.upsertProfile({
		providerId,
		timezone: parsed.timezone,
		defaultCurrency: parsed.defaultCurrency,
		supportEmail: parsed.supportEmail ?? null,
		supportPhone: parsed.supportPhone ?? null,
	})

	return { providerId }
}
