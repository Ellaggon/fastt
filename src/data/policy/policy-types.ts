export type UIGroup = "establishment" | "cancellation" | "payment"

export type PolicyType =
	// | "Cancellation"
	| "Smoking"
	| "Pets"
	| "CheckIn"
	| "CheckOut"
	| "Children"
	| "Access"
	| "ExtraBeds"
	| "Payment"
	| "Other"

export interface Policy {
	id: string
	policyType: PolicyType
	description: string
	isActive: boolean
}

export type GroupedPolicies = Partial<Record<PolicyType, Policy[]>>

export type UIGroups = Record<UIGroup, GroupedPolicies>

export const POLICY_TYPE_TO_UI_GROUP: Record<PolicyType, UIGroup> = {
	// Cancellation: "cancellation",
	Payment: "payment",
	Smoking: "establishment",
	Pets: "establishment",
	CheckIn: "establishment",
	CheckOut: "establishment",
	Children: "establishment",
	Access: "establishment",
	ExtraBeds: "establishment",
	Other: "establishment",
}