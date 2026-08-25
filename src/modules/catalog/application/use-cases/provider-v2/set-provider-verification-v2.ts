import type {
	ProviderV2RepositoryPort,
	ProviderVerificationStatus,
} from "../../ports/ProviderV2RepositoryPort"
import { providerVerificationSchema } from "@/schemas/provider"
import { ValidationError } from "@/lib/validation/ValidationError"

export async function setProviderVerificationV2(
	deps: { repo: ProviderV2RepositoryPort },
	params: {
		providerId: string
		status: unknown
		reason?: string | null
		reviewedByUserId?: string | null
		metadataJson?: string | null
	}
): Promise<{ providerId: string }> {
	const result = providerVerificationSchema.safeParse({
		status: params.status,
		reason: params.reason ?? undefined,
		reviewedByUserId: params.reviewedByUserId ?? undefined,
		metadataJson: params.metadataJson ?? undefined,
	})
	if (!result.success) {
		throw new ValidationError(result.error)
	}
	const parsed = result.data

	const providerId = String(params.providerId || "").trim()
	if (!providerId) throw new Error("Provider not found for current user")

	const metadata: unknown = parsed.metadataJson ? JSON.parse(parsed.metadataJson) : null

	await deps.repo.setVerificationStatus({
		providerId,
		status: parsed.status satisfies ProviderVerificationStatus,
		reason: parsed.reason ?? null,
		reviewedByUserId: parsed.reviewedByUserId ?? null,
		metadataJson: metadata,
	})

	return { providerId }
}
