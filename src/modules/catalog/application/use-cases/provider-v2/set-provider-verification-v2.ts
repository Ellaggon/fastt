import type {
	ProviderV2RepositoryPort,
	ProviderVerificationStatus,
} from "../../ports/ProviderV2RepositoryPort"
import { providerVerificationSchema } from "../../schemas/provider-v2/providerVerificationSchema"

export async function setProviderVerificationV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		sessionEmail: string
		status: unknown
		reason?: string | null
		reviewedBy?: string | null
		metadataJson?: string | null
	}
): Promise<{ providerId: string }> {
	const parsed = providerVerificationSchema.parse({
		status: params.status,
		reason: params.reason ?? undefined,
		reviewedBy: params.reviewedBy ?? undefined,
		metadataJson: params.metadataJson ?? undefined,
	})

	const providerId = await deps.repo.getProviderIdByUserEmail(params.sessionEmail)
	if (!providerId) throw new Error("Provider not found for current user")

	const metadata: unknown = parsed.metadataJson ? JSON.parse(parsed.metadataJson) : null

	await deps.repo.setVerificationStatus({
		providerId,
		status: parsed.status satisfies ProviderVerificationStatus,
		reason: parsed.reason ?? null,
		reviewedBy: parsed.reviewedBy ?? null,
		metadataJson: metadata,
	})

	return { providerId }
}
