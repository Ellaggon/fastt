export type RatePlanIntentId = "flexible" | "non_refundable" | "long_stay" | "early_booking"

export type RatePlanIntentPreset = {
	id: RatePlanIntentId
	name: string
	summary: string
	description: string
	guestPromise: string
	paymentType: "pay_at_property" | "prepaid"
	refundable: boolean
	type: "package" | "percentage_discount"
	value: number
	minNights?: number
	minAdvanceDays?: number
	tags: string[]
}

export const ratePlanIntentPresets: RatePlanIntentPreset[] = [
	{
		id: "flexible",
		name: "Tarifa flexible",
		summary: "La opción estándar para vender con condiciones simples.",
		description: "Para huéspedes que priorizan flexibilidad y una compra fácil.",
		guestPromise: "Compra clara, condiciones más flexibles y precio base del calendario.",
		paymentType: "pay_at_property",
		refundable: true,
		type: "package",
		value: 0,
		tags: ["Estándar", "Flexible"],
	},
	{
		id: "non_refundable",
		name: "No reembolsable",
		summary: "Precio más atractivo a cambio de condiciones firmes.",
		description: "Para vender una alternativa más barata cuando el huésped acepta no reembolso.",
		guestPromise: "Menor precio, pago anticipado y condiciones más estrictas.",
		paymentType: "prepaid",
		refundable: false,
		type: "percentage_discount",
		value: 10,
		tags: ["-10%", "Pago anticipado"],
	},
	{
		id: "long_stay",
		name: "Estadía larga",
		summary: "Incentiva reservas de más noches.",
		description: "Para huéspedes que se quedan varios días y merecen una tarifa más conveniente.",
		guestPromise: "Descuento automático cuando la reserva cumple noches mínimas.",
		paymentType: "pay_at_property",
		refundable: true,
		type: "percentage_discount",
		value: 12,
		minNights: 7,
		tags: ["7+ noches", "-12%"],
	},
	{
		id: "early_booking",
		name: "Anticipada",
		summary: "Premia reservas hechas con tiempo.",
		description: "Para mejorar planificación y ocupación futura sin tocar cada fecha manualmente.",
		guestPromise: "Descuento automático para reservas hechas con anticipación.",
		paymentType: "prepaid",
		refundable: true,
		type: "percentage_discount",
		value: 10,
		minAdvanceDays: 21,
		tags: ["21+ días", "-10%"],
	},
]

export function findRatePlanIntentPreset(id: string | null | undefined): RatePlanIntentPreset {
	return ratePlanIntentPresets.find((preset) => preset.id === id) ?? ratePlanIntentPresets[0]
}

export function guessRatePlanIntentId(name: string | null | undefined): RatePlanIntentId {
	const normalized = String(name ?? "").toLowerCase()
	if (normalized.includes("no reembols")) return "non_refundable"
	if (normalized.includes("estad")) return "long_stay"
	if (normalized.includes("anticip")) return "early_booking"
	return "flexible"
}
