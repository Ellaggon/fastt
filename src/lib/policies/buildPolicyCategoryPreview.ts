import type { PolicyFinancialPreviewResult, RefundQuote } from "@/modules/financial/public"
import type { HoldPolicyItemSnapshot } from "@/modules/policies/public"

export type PolicyCategoryPreviewItem = {
	key: string
	label: string
	value: string
	detail?: string
}

export type PolicyCategoryPreview = {
	category: string
	title: string
	description: string
	previewReady: boolean
	items: PolicyCategoryPreviewItem[]
}

type Input = {
	category: string
	financialPreview: PolicyFinancialPreviewResult
}

function formatMoney(value: unknown, currency: string): string {
	const amount = Number(value)
	return new Intl.NumberFormat("es-BO", {
		style: "currency",
		currency,
		maximumFractionDigits: 2,
	}).format(Number.isFinite(amount) ? amount : 0)
}

function formatPercent(value: unknown): string {
	const amount = Number(value)
	return Number.isFinite(amount) ? `${Math.round(amount * 100) / 100}%` : "Revisión manual"
}

function formatDeadline(value: unknown): string {
	const raw = String(value ?? "").trim()
	if (!raw) return "Sin fecha límite calculable"
	if (raw === "grace_period") return "Dentro del periodo de gracia"
	const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
	if (!match) return "Según la hora local del alojamiento"
	const [, year, month, day, hour, minute] = match
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
	const dateLabel = new Intl.DateTimeFormat("es-BO", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(date)
	return `${dateLabel}, ${hour}:${minute}`
}

function rulesMap(item: HoldPolicyItemSnapshot | null): Record<string, unknown> {
	const rules = Array.isArray(item?.rules) ? item.rules : []
	return Object.fromEntries(
		rules
			.map((rule: any) => [String(rule?.ruleKey ?? "").trim(), rule?.ruleValue] as const)
			.filter(([key]: readonly [string, unknown]) => Boolean(key))
	)
}

function refundValue(quote: RefundQuote): string {
	return `${formatMoney(quote.refundAmount, quote.currency)} · ${formatPercent(
		quote.refundPercent
	)} de reembolso`
}

function cancellationPreview(
	financialPreview: PolicyFinancialPreviewResult
): PolicyCategoryPreview {
	const { snapshot, quotes } = financialPreview
	const cancellation = snapshot.cancellation?.calculation?.cancellation
	const freeDeadline = cancellation?.freeCancellationDeadlineLocal
	const hostPayout = quotes.cancelToday.policySnapshot.hostPayoutAmount
	const taxRefund = quotes.cancelToday.taxFeeRefundAmount

	return {
		category: "Cancellation",
		title: "Vista previa de cancelación",
		description: "Plazos y consecuencias que verá el huésped antes de reservar.",
		previewReady: Boolean(snapshot.cancellation && cancellation?.refundTiers?.length),
		items: [
			{
				key: "free_cancellation",
				label: "Cancelación gratuita",
				value: freeDeadline ? `Hasta ${formatDeadline(freeDeadline)}` : "No disponible",
				detail: "Calculado con la hora local del alojamiento.",
			},
			{
				key: "cancel_7_days",
				label: "Si cancela 7 días antes",
				value: refundValue(quotes.cancelSevenDaysBefore),
				detail: `${formatMoney(
					quotes.cancelSevenDaysBefore.nonRefundableAmount,
					quotes.cancelSevenDaysBefore.currency
				)} no reembolsable.`,
			},
			{
				key: "cancel_today",
				label: "Si cancela hoy",
				value: refundValue(quotes.cancelToday),
				detail: `${formatMoney(
					quotes.cancelToday.nonRefundableAmount,
					quotes.cancelToday.currency
				)} no reembolsable.`,
			},
			{
				key: "long_stay",
				label: "Estadía de 28 noches",
				value: refundValue(quotes.longStay),
				detail: financialPreview.longStaySnapshot.cancellation?.calculation?.cancellation
					?.stayLength?.isLongStay
					? "Se aplica el tratamiento de larga estadía."
					: "Mantiene esta misma condición de cancelación.",
			},
			{
				key: "financial_impact",
				label: "Impuestos y cobro del alojamiento",
				value: `${formatMoney(taxRefund, quotes.cancelToday.currency)} en impuestos/cargos`,
				detail:
					hostPayout == null
						? "El cobro del alojamiento requiere revisión."
						: `${formatMoney(hostPayout, quotes.cancelToday.currency)} estimado para el alojamiento.`,
			},
		],
	}
}

function paymentPreview(financialPreview: PolicyFinancialPreviewResult): PolicyCategoryPreview {
	const paymentItem = financialPreview.snapshot.payment
	const payment = paymentItem?.calculation?.payment
	const rules = rulesMap(paymentItem)
	const percentage = Number(payment?.prepaymentPercentage ?? rules.prepaymentPercentage)
	const paymentType = String(payment?.paymentType ?? rules.paymentType ?? "")
	const isAtProperty = paymentType === "pay_at_property"
	const amountLabel = isAtProperty
		? "El alojamiento cobra el total"
		: Number.isFinite(percentage)
			? `${Math.round(percentage)}% de la reserva`
			: "Importe pendiente de definir"
	const guaranteeLabel = isAtProperty
		? "Sin prepago en plataforma"
		: Number.isFinite(percentage) && percentage < 100
			? `Depósito del ${Math.round(percentage)}%`
			: "Prepago total"

	return {
		category: "Payment",
		title: "Vista previa de pago y garantía",
		description: "Cuándo paga el huésped y qué importe asegura la reserva.",
		previewReady: Boolean(paymentItem && paymentType),
		items: [
			{
				key: "payment_timing",
				label: "Momento del cobro",
				value: isAtProperty ? "Al llegar al alojamiento" : "Antes de la llegada",
			},
			{
				key: "payment_amount",
				label: "Importe requerido",
				value: amountLabel,
				detail: isAtProperty
					? "Fastt no realiza un cobro anticipado."
					: "El importe se calcula sobre el total de la reserva.",
			},
			{
				key: "payment_due",
				label: "Vencimiento",
				value: isAtProperty ? "Durante la estancia" : formatDeadline(payment?.paymentDueLocal),
				detail: isAtProperty
					? "Según el proceso local del alojamiento."
					: "Hora local del alojamiento.",
			},
			{
				key: "payment_guarantee",
				label: "Garantía de la reserva",
				value: guaranteeLabel,
			},
		],
	}
}

function noShowPreview(financialPreview: PolicyFinancialPreviewResult): PolicyCategoryPreview {
	const noShowItem = financialPreview.snapshot.no_show
	const noShow = noShowItem?.calculation?.noShow
	const chargeType = String(noShow?.chargeType ?? "")
	const chargeAmount = Number(noShow?.chargeAmount)
	const chargeValue =
		chargeType === "first_night"
			? "Primera noche"
			: chargeType === "full"
				? "Estadía completa"
				: chargeType === "waived"
					? "Sin cargo"
					: chargeType === "percentage" && Number.isFinite(chargeAmount)
						? `${Math.round(chargeAmount)}% de la reserva`
						: "Revisión manual"
	const payoutPercent = noShow?.payoutImpact?.hostPayoutPercent

	return {
		category: "NoShow",
		title: "Vista previa de no presentación",
		description: "Qué se cobra cuando el huésped no llega y no cancela.",
		previewReady: Boolean(noShowItem && chargeType),
		items: [
			{
				key: "no_show_charge",
				label: "Cargo al huésped",
				value: chargeValue,
			},
			{
				key: "no_show_basis",
				label: "Base del cargo",
				value:
					chargeType === "first_night"
						? "Precio de la primera noche"
						: chargeType === "full"
							? "Total contratado"
							: String(noShow?.chargeBasis ?? "Según la condición"),
			},
			{
				key: "no_show_payout",
				label: "Cobro del alojamiento",
				value:
					payoutPercent == null
						? "Según el importe efectivamente cobrado"
						: `${formatPercent(payoutPercent)} del total`,
				detail: "Sujeto a excepciones legales o de soporte.",
			},
		],
	}
}

function arrivalPreview(financialPreview: PolicyFinancialPreviewResult): PolicyCategoryPreview {
	const arrivalItem = financialPreview.snapshot.check_in
	const rules = rulesMap(arrivalItem)
	const checkInFrom = String(rules.checkInFrom ?? "").trim()
	const checkInUntil = String(rules.checkInUntil ?? "").trim()
	const checkOutUntil = String(rules.checkOutUntil ?? "").trim()

	return {
		category: "CheckIn",
		title: "Vista previa de llegada y salida",
		description: "Horarios que verán el huésped y el equipo de recepción.",
		previewReady: Boolean(arrivalItem && checkInFrom && checkOutUntil),
		items: [
			{
				key: "check_in",
				label: "Llegada",
				value:
					checkInFrom && checkInUntil
						? `${checkInFrom}–${checkInUntil}`
						: checkInFrom
							? `Desde ${checkInFrom}`
							: "Horario pendiente",
			},
			{
				key: "check_out",
				label: "Salida",
				value: checkOutUntil ? `Hasta ${checkOutUntil}` : "Horario pendiente",
			},
			{
				key: "arrival_local_time",
				label: "Referencia horaria",
				value: "Hora local del alojamiento",
				detail:
					checkInUntil === "00:00"
						? "La llegada tardía está permitida hasta medianoche."
						: "Las llegadas fuera de la ventana requieren coordinación.",
			},
		],
	}
}

export function buildPolicyCategoryPreview(input: Input): PolicyCategoryPreview {
	switch (String(input.category)) {
		case "Cancellation":
			return cancellationPreview(input.financialPreview)
		case "Payment":
			return paymentPreview(input.financialPreview)
		case "NoShow":
			return noShowPreview(input.financialPreview)
		case "CheckIn":
			return arrivalPreview(input.financialPreview)
		default:
			return {
				category: String(input.category || "Unknown"),
				title: "Vista previa de la condición",
				description: "Revisa la consecuencia antes de confirmar.",
				previewReady: false,
				items: [],
			}
	}
}
