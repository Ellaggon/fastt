/**
 * Stage 4 provider finance readiness profile.
 *
 * This is operational visibility for payout readiness. It is not bank orchestration and does not
 * initiate provider disbursement.
 */
export const PROVIDER_FINANCIAL_PROFILE_STATUSES = ["ready", "incomplete", "blocked"] as const
export const PROVIDER_TAX_PROFILE_STATUSES = ["verified", "missing", "pending_review"] as const

export type ProviderFinancialProfileStatus = (typeof PROVIDER_FINANCIAL_PROFILE_STATUSES)[number]
export type ProviderTaxProfileStatus = (typeof PROVIDER_TAX_PROFILE_STATUSES)[number]

export type ProviderFinancialProfile = {
	providerId: string
	payoutMethodReference?: string | null
	payoutSchedule: string
	currency: string
	taxProfileStatus: ProviderTaxProfileStatus
	status: ProviderFinancialProfileStatus
	createdAt: Date
	updatedAt: Date
}
