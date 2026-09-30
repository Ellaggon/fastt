import type { PolicyCategory } from "@/modules/policies/public"

export type PolicyBusinessKind = "hotel" | "tour" | "unknown"

export type PolicyBusinessContract = {
	business: PolicyBusinessKind
	requiredCategories: readonly PolicyCategory[]
	allowedCategories: readonly PolicyCategory[]
	cancellation: {
		anchor: "arrival" | "scheduled_departure" | "unsupported"
		allowedLeadUnits: readonly ("days" | "hours")[]
		allowedPenaltyBases: readonly ("total_booking" | "room_rate")[]
	}
	noShow: {
		allowedPenaltyBases: readonly ("first_night" | "total_booking" | "percentage")[]
	}
	payment: {
		allowedTypes: readonly ("pay_at_property" | "prepayment")[]
		platformCollectsFunds: boolean
	}
}

/** Shared vertical policy contract used by editors, readiness, and publication checks. */
export const POLICY_BUSINESS_CONTRACTS: Record<PolicyBusinessKind, PolicyBusinessContract> = {
	hotel: {
		business: "hotel",
		requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		allowedCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		cancellation: {
			anchor: "arrival",
			allowedLeadUnits: ["days"],
			allowedPenaltyBases: ["total_booking", "room_rate"],
		},
		noShow: { allowedPenaltyBases: ["first_night", "total_booking", "percentage"] },
		payment: { allowedTypes: ["pay_at_property", "prepayment"], platformCollectsFunds: true },
	},
	tour: {
		business: "tour",
		requiredCategories: ["Cancellation", "Payment", "NoShow"],
		allowedCategories: ["Cancellation", "Payment", "NoShow"],
		cancellation: {
			anchor: "scheduled_departure",
			allowedLeadUnits: ["hours"],
			allowedPenaltyBases: ["total_booking"],
		},
		noShow: { allowedPenaltyBases: ["total_booking", "percentage"] },
		payment: { allowedTypes: ["pay_at_property"], platformCollectsFunds: false },
	},
	unknown: {
		business: "unknown",
		requiredCategories: [],
		allowedCategories: [],
		cancellation: {
			anchor: "unsupported",
			allowedLeadUnits: [],
			allowedPenaltyBases: [],
		},
		noShow: { allowedPenaltyBases: [] },
		payment: { allowedTypes: [], platformCollectsFunds: false },
	},
}

export function policyBusinessKindFromProductType(productType: unknown): PolicyBusinessKind {
	const value = String(productType ?? "")
		.trim()
		.toLowerCase()
	if (value === "tour") return "tour"
	if (["hotel", "accommodation", "hostel", "apartment", "rental"].includes(value)) {
		return "hotel"
	}
	return "unknown"
}

export function getPolicyBusinessContract(productType: unknown): PolicyBusinessContract {
	return POLICY_BUSINESS_CONTRACTS[policyBusinessKindFromProductType(productType)]
}

export function getRequiredPolicyCategories(productType: unknown): readonly PolicyCategory[] {
	return getPolicyBusinessContract(productType).requiredCategories
}
