import type { CancellationTierInput, PolicyCategory } from "@/modules/policies/public"

export type PolicyPresetKey =
	| "flexible"
	| "moderate"
	| "limited"
	| "firm"
	| "strict"
	| "long_term"
	| "non_refundable"
	| "pay_at_property"
	| "prepayment_full"
	| "deposit_50"
	| "standard_check_in"
	| "late_arrival"
	| "no_show_first_night"
	| "no_show_full_stay"
	| "no_show_percentage_100"

export type PolicyPreset = {
	key: PolicyPresetKey
	category: PolicyCategory
	name: string
	description: string
	guestFacing: string
	operationalMeaning: string
	stayLengthType: "any" | "short_stay" | "long_stay" | "monthly"
	gracePeriod: number
	refundBasis:
		| "total_booking"
		| "room_rate"
		| "first_night"
		| "deposit"
		| "provider_policy"
		| "none"
	payoutBasis: "gross" | "net" | "collected" | "provider_policy"
	localTimezone: string
	rules: Record<string, unknown>
	cancellationTiers?: CancellationTierInput[]
}

const cancellationPreset = (
	preset: Omit<PolicyPreset, "category" | "localTimezone">
): PolicyPreset => ({
	...preset,
	category: "Cancellation",
	localTimezone: "property_local",
})

export const POLICY_PRESET_CATALOG = [
	cancellationPreset({
		key: "flexible",
		name: "Flexible",
		description: "Cancelación sin penalidad hasta 24 horas antes del ingreso.",
		guestFacing: "El huésped puede cancelar hasta 1 día antes de la llegada sin penalidad.",
		operationalMeaning: "Condición flexible tipo OTA para disponibilidad pública amplia.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			maxStayNights: 27,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "moderate",
		name: "Moderada",
		description:
			"Cancelación sin penalidad hasta 5 días antes del ingreso; luego penalidad completa.",
		guestFacing: "El huésped puede cancelar hasta 5 días antes de la llegada sin penalidad.",
		operationalMeaning: "Condición OTA equilibrada para tarifas reembolsables estándar.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			maxStayNights: 27,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 5, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "limited",
		name: "Limitada",
		description:
			"Cancelación sin penalidad hasta 7 días antes del ingreso; luego penalidad parcial o completa.",
		guestFacing:
			"El huésped puede cancelar hasta 7 días antes de la llegada sin penalidad; después aplica reembolso parcial.",
		operationalMeaning:
			"Flexibilidad limitada tipo OTA para fechas que necesitan mayor protección.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			maxStayNights: 27,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "firm",
		name: "Firme",
		description:
			"Cancelación sin penalidad hasta 30 días antes del ingreso; luego penalidad escalonada.",
		guestFacing:
			"El huésped puede cancelar hasta 30 días antes de la llegada sin penalidad; después aplica reembolso parcial.",
		operationalMeaning: "Condición firme para fechas de alta demanda o inventario escaso.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		rules: {
			maxStayNights: 27,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "strict",
		name: "Estricta",
		description:
			"Cancelación estricta con reembolso parcial solo si se cancela con mucha anticipación.",
		guestFacing: "El huésped recibe reembolso parcial solo si cancela con mucha anticipación.",
		operationalMeaning: "Plantilla estricta para tarifas de alta protección contractual.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		rules: {
			maxStayNights: 27,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 14, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "long_term",
		name: "Larga estadía",
		description: "Cancelación para estadías largas con ventana sin penalidad de 30 días.",
		guestFacing:
			"El huésped con estadía larga puede cancelar hasta 30 días antes de la llegada sin penalidad.",
		operationalMeaning: "Condición OTA para estadías mensuales o extendidas.",
		stayLengthType: "long_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		rules: {
			minStayNights: 28,
			stayLengthThresholdNights: 28,
			gracePeriodRequiresDaysBeforeArrival: 2,
			taxesFeesBasis: "pro_rated",
			taxRefundProration: "same_as_room_refund",
		},
		cancellationTiers: [
			{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "non_refundable",
		name: "No reembolsable",
		description: "La cancelación siempre aplica penalidad completa.",
		guestFacing: "Si el huésped cancela, la reserva no es reembolsable.",
		operationalMeaning:
			"Usar solo cuando la tarifa informa claramente que la reserva no es reembolsable.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "gross",
		rules: {
			stayLengthThresholdNights: 28,
			taxesFeesBasis: "non_refundable",
			taxRefundProration: "none",
		},
		cancellationTiers: [{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 }],
	}),
	{
		key: "pay_at_property",
		category: "Payment",
		name: "Pago en propiedad",
		description: "El huésped paga en la propiedad.",
		guestFacing: "El pago lo cobra la propiedad según su proceso local.",
		operationalMeaning: "No se requiere prepago de plataforma antes de la llegada.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "provider_policy",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		rules: { paymentType: "pay_at_property" },
	},
	{
		key: "prepayment_full",
		category: "Payment",
		name: "Prepago total",
		description: "El huésped debe prepagarlo todo antes de llegar.",
		guestFacing: "El monto completo de la reserva vence antes de la llegada.",
		operationalMeaning: "Usar con condiciones más estrictas o periodos de alta demanda.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		rules: {
			paymentType: "prepayment",
			prepaymentPercentage: 100,
			prepaymentDaysBeforeArrival: 0,
		},
	},
	{
		key: "deposit_50",
		category: "Payment",
		name: "Depósito 50%",
		description: "El huésped prepaga un depósito del 50% antes de llegar.",
		guestFacing: "Se requiere un prepago del 50% para asegurar la reserva.",
		operationalMeaning: "Guarda el contrato de pago como términos estructurados.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "deposit",
		payoutBasis: "collected",
		localTimezone: "property_local",
		rules: {
			paymentType: "prepayment",
			prepaymentPercentage: 50,
			prepaymentDaysBeforeArrival: 0,
		},
	},
	{
		key: "standard_check_in",
		category: "CheckIn",
		name: "Ingreso estándar",
		description: "Ingreso desde 15:00 y salida hasta 11:00.",
		guestFacing: "El ingreso comienza a las 15:00 y la salida es hasta las 11:00.",
		operationalMeaning: "Ventana operativa predeterminada para la mayoría de alojamientos.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		rules: { checkInFrom: "15:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
	},
	{
		key: "late_arrival",
		category: "CheckIn",
		name: "Llegada tardía",
		description: "Ingreso desde 15:00 hasta 00:00 y salida hasta 11:00.",
		guestFacing: "El huésped puede llegar más tarde, hasta medianoche.",
		operationalMeaning: "Usar solo cuando recepción o autoingreso soportan llegadas tardías.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		rules: { checkInFrom: "15:00", checkInUntil: "00:00", checkOutUntil: "11:00" },
	},
	{
		key: "no_show_first_night",
		category: "NoShow",
		name: "No presentación: primera noche",
		description: "Si el huésped no llega, se cobra la primera noche.",
		guestFacing: "Si el huésped no llega, se cobra la primera noche.",
		operationalMeaning: "Predeterminado equilibrado para tarifas flexibles y moderadas.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "first_night",
		payoutBasis: "gross",
		localTimezone: "property_local",
		rules: { penaltyType: "first_night" },
	},
	{
		key: "no_show_full_stay",
		category: "NoShow",
		name: "No presentación: estadía completa",
		description: "Si el huésped no llega, se cobra la estadía completa.",
		guestFacing: "Si el huésped no llega, se cobra el monto completo de la reserva.",
		operationalMeaning: "Usar para tarifas más estrictas o no reembolsables.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		rules: { penaltyType: "full" },
	},
	{
		key: "no_show_percentage_100",
		category: "NoShow",
		name: "No presentación: 100%",
		description: "Si el huésped no llega, se cobra el 100% de la reserva.",
		guestFacing: "Si el huésped no llega, se cobra el 100% del monto de la reserva.",
		operationalMeaning: "Equivale a penalidad completa conservando semántica porcentual.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		rules: { penaltyType: "percentage", penaltyAmount: 100 },
	},
] as const satisfies readonly PolicyPreset[]

export const POLICY_PRESETS = POLICY_PRESET_CATALOG.reduce(
	(acc, preset) => {
		acc[preset.category] ??= []
		acc[preset.category].push(preset)
		return acc
	},
	{} as Record<PolicyCategory, PolicyPreset[]>
)

const INTERNAL_PRESET_ALIASES: Record<string, PolicyPresetKey> = {
	flex_24h: "flexible",
	moderate_7d: "moderate",
	standard: "standard_check_in",
	first_night: "no_show_first_night",
	full_stay: "no_show_full_stay",
	percentage_100: "no_show_percentage_100",
}

export function resolvePolicyPreset(
	key: string | null | undefined,
	category?: PolicyCategory
): PolicyPreset | null {
	const normalized = String(key ?? "").trim()
	if (!normalized) return null
	const canonicalKey = INTERNAL_PRESET_ALIASES[normalized] ?? normalized
	const preset =
		POLICY_PRESET_CATALOG.find(
			(item) => item.key === canonicalKey && (!category || item.category === category)
		) ?? null
	return preset
}

export function clonePolicyPresetRules(preset: PolicyPreset): Record<string, unknown> {
	return structuredClone(preset.rules)
}

export function clonePolicyPresetCancellationTiers(
	preset: PolicyPreset
): CancellationTierInput[] | undefined {
	return preset.cancellationTiers ? structuredClone(preset.cancellationTiers) : undefined
}
