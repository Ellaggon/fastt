import type { PolicyType } from "./policy-types"

export const POLICY_CATEGORY_ORDER: Record<PolicyType, string> = {
	// Cancellation: "Cancelación",
	Smoking: "Política de fumar",
	Pets: "Mascotas",
	CheckIn: "Check In",
	CheckOut: "Check Out",
	Children: "Niños",
	Access: "Acceso",
	ExtraBeds: "Camas Adicionales",
	Payment: "Pago",
	Other: "Otros",
}

export const POLICY_UI_GROUPS = {
	establishment: [
		"CheckIn",
		"CheckOut",
		"Children",
		"Pets",
		"Smoking",
		"Access",
		"ExtraBeds",
		"Other",
	],
	// cancellation: ["Cancellation"],
	payment: ["Payment"],
} as const
