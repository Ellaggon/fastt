import type { RatePlanIntentId } from "./ratePlanIntentPresets"

export type ContractPresetBundle = {
	Cancellation: string
	Payment: string
	CheckIn: string
	NoShow: string
}

export type CommercialIntentSpec = {
	type: "package" | "percentage_discount"
	value: number
	minNights?: number
	minAdvanceDays?: number
	contract: ContractPresetBundle
}

const flexibleContract: ContractPresetBundle = {
	Cancellation: "flexible",
	Payment: "pay_at_property",
	CheckIn: "standard_check_in",
	NoShow: "no_show_first_night",
}

const specs: Record<RatePlanIntentId, CommercialIntentSpec> = {
	flexible: {
		type: "package",
		value: 0,
		contract: flexibleContract,
	},
	non_refundable: {
		type: "percentage_discount",
		value: 10,
		contract: {
			Cancellation: "non_refundable",
			Payment: "prepayment_full",
			CheckIn: "standard_check_in",
			NoShow: "no_show_full_stay",
		},
	},
	long_stay: {
		type: "percentage_discount",
		value: 12,
		minNights: 7,
		contract: { ...flexibleContract, Cancellation: "long_term" },
	},
	early_booking: {
		type: "percentage_discount",
		value: 10,
		minAdvanceDays: 21,
		contract: flexibleContract,
	},
}

export function resolveCommercialIntentSpec(intent: RatePlanIntentId): CommercialIntentSpec {
	return specs[intent]
}
