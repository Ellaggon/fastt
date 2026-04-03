export type ProviderV2Status = "draft" | "active" | "archived"

export type ProviderVerificationStatus = "pending" | "approved" | "rejected"

export interface ProviderV2RepositoryPort {
	updateProviderIdentity?(params: {
		providerId: string
		displayName?: string | null
		legalName?: string | null
	}): Promise<void>

	registerProvider(params: {
		provider: {
			id: string
			legalName?: string | null
			displayName?: string | null
			status?: ProviderV2Status
		}
		userEmailForLink: string
		role?: "owner" | "admin" | "staff"
	}): Promise<{ providerId: string; created: boolean }>

	upsertProfile(params: {
		providerId: string
		timezone: string
		defaultCurrency: string
		supportEmail?: string | null
		supportPhone?: string | null
	}): Promise<void>

	setVerificationStatus(params: {
		providerId: string
		status: ProviderVerificationStatus
		reason?: string | null
		reviewedBy?: string | null
		metadataJson?: unknown
	}): Promise<void>
}
