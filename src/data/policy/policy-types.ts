export type PolicyType = "Cancellation" | "Payment" | "CheckIn" | "NoShow"

// UI-only policy type used by hotel/provider pages.
// This intentionally matches the CAPA 6 backend-supported categories.
export interface Policy {
	id: string
	policyType: PolicyType
	description: string
	isActive: boolean
}
