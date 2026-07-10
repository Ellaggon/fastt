import type { PolicyType } from "./policy-types"

export const POLICY_CATEGORY_LABELS: Record<PolicyType, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Llegada y salida",
	NoShow: "No presentación",
}

export const POLICY_CATEGORY_ORDER = POLICY_CATEGORY_LABELS

export const POLICY_UI_GROUPS = {
	booking: ["Cancellation", "Payment", "CheckIn", "NoShow"],
} as const

export const POLICY_CATEGORY_OPTIONS = POLICY_UI_GROUPS.booking.map((value) => ({
	value,
	label: POLICY_CATEGORY_LABELS[value],
}))

export const POLICY_MISSING_CATEGORY_LABELS: Record<PolicyType, string> = {
	Cancellation: "cancelación",
	Payment: "pago",
	CheckIn: "llegada/salida",
	NoShow: "no presentación",
}

export const POLICY_CATEGORY_PREVIEW_COPY: Record<
	PolicyType,
	{ title: string; description: string }
> = {
	Cancellation: {
		title: "Vista previa de cancelación",
		description: "Plazos y consecuencias que verá el huésped antes de reservar.",
	},
	Payment: {
		title: "Vista previa de pago y garantía",
		description: "Cuándo paga el huésped y qué importe asegura la reserva.",
	},
	NoShow: {
		title: "Vista previa de no presentación",
		description: "Qué se cobra cuando el huésped no llega y no cancela.",
	},
	CheckIn: {
		title: "Vista previa de llegada y salida",
		description: "Horarios que verán el huésped y el equipo de recepción.",
	},
}

export function getPolicyCategoryLabel(category: unknown, fallback = "Condición"): string {
	const key = String(category ?? "") as PolicyType
	return POLICY_CATEGORY_LABELS[key] ?? (String(category ?? "").trim() || fallback)
}

export function getPolicyMissingCategoryLabel(category: unknown): string {
	const key = String(category ?? "") as PolicyType
	return POLICY_MISSING_CATEGORY_LABELS[key] ?? String(category ?? "")
}

export function getPolicyCategoryPreviewCopy(category: unknown): {
	title: string
	description: string
} {
	const key = String(category ?? "") as PolicyType
	return (
		POLICY_CATEGORY_PREVIEW_COPY[key] ?? {
			title: "Vista previa de la condición",
			description: "Consecuencias visibles antes de confirmar la asignación.",
		}
	)
}
