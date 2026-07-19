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
		taxResidenceCountry?: string | null
		businessRegistrationNumber?: string | null
		fiscalStatus?: string | null
		paymentReadinessStatus?: string | null
		integrationReadinessStatus?: string | null
	}
): Promise<{ providerId: string }> {
	const result = providerProfileSchema.safeParse({
		timezone: params.timezone,
		defaultCurrency: params.defaultCurrency,
		supportEmail: params.supportEmail ?? undefined,
		supportPhone: params.supportPhone ?? undefined,
		taxResidenceCountry: params.taxResidenceCountry ?? undefined,
		businessRegistrationNumber: params.businessRegistrationNumber ?? undefined,
		fiscalStatus: params.fiscalStatus ?? undefined,
		paymentReadinessStatus: params.paymentReadinessStatus ?? undefined,
		integrationReadinessStatus: params.integrationReadinessStatus ?? undefined,
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
		taxResidenceCountry: parsed.taxResidenceCountry ?? null,
		businessRegistrationNumber: parsed.businessRegistrationNumber ?? null,
		fiscalStatus: parsed.fiscalStatus ?? null,
		paymentReadinessStatus: parsed.paymentReadinessStatus ?? null,
		integrationReadinessStatus: parsed.integrationReadinessStatus ?? null,
	})

	return { providerId }
}
