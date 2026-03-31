import type { PolicyType } from "./policy-types"

export const POLICY_CATEGORY_ORDER: Record<PolicyType, string> = {
	Cancellation: "Cancellation policy",
	Payment: "Payment policy",
	CheckIn: "Check-in / Check-out",
	NoShow: "No-show",
}

export const POLICY_UI_GROUPS = {
	booking: ["Cancellation", "Payment", "CheckIn", "NoShow"],
} as const
