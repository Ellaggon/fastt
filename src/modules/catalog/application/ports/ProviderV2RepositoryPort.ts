export type ProviderV2Status = "draft" | "active" | "archived"

export type ProviderVerificationStatus = "pending" | "approved" | "rejected"

export interface ProviderV2RepositoryPort {
	getProviderIdByUserEmail(email: string): Promise<string | null>

	registerProvider(params: {
		provider: {
			id: string
			userEmail: string
			companyName: string
			legalName?: string | null
			displayName?: string | null
			type?: string | null
			contactName?: string | null
			contactEmail?: string | null
			phone?: string | null
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
