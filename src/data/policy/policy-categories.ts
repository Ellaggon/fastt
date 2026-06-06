import type { PolicyType } from "./policy-types"

export const POLICY_CATEGORY_ORDER: Record<PolicyType, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso / salida",
	NoShow: "No presentación",
}

export const POLICY_UI_GROUPS = {
	booking: ["Cancellation", "Payment", "CheckIn", "NoShow"],
} as const
