import type { HoldPolicySnapshot } from "@/modules/policies/public"
import type { PolicyCategoryPreview } from "./buildPolicyCategoryPreview"

export type TourPolicyPreviewContext = {
	departureDate: string | null
	departureTime: string | null
	departureDateSource?: "requested" | "next_available" | null
	availabilityStepIsNext?: boolean
	timezone: string | null
	currency: string | null
	quoteAmount: number | null
	configuredCancellationTiers?: Array<{
		daysBeforeArrival?: number | null
		hoursBeforeDeparture?: number | null
		penaltyType?: string | null
		penaltyAmount?: number | null
	}>
}

function rules(snapshot: HoldPolicySnapshot, category: "payment" | "no_show") {
	return Object.fromEntries(
		(snapshot[category]?.rules ?? [])
			.filter((rule: any) => rule?.ruleKey)
			.map((rule: any) => [String(rule.ruleKey), rule.ruleValue])
	)
}

function formatDateOnly(value: string): string {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
	if (!match) return "Fecha pendiente"
	const [, year, month, day] = match
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
	return new Intl.DateTimeFormat("es-BO", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(date)
}

function formatDeadline(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
	if (!match) return null
	const [, year, month, day, hour, minute] = match
	return `${formatDateOnly(`${year}-${month}-${day}`)} a las ${hour}:${minute}`
}

function timezoneDetail(context: TourPolicyPreviewContext): string {
	return context.timezone
		? "Calculado en la hora local configurada para la experiencia."
		: "Hora local de la experiencia."
}

function departureReference(context: TourPolicyPreviewContext) {
	if (!context.departureDate) {
		return context.availabilityStepIsNext
			? "Se configura en el siguiente paso de la guía."
			: "No hay fechas futuras con cupo para esta salida."
	}
	const time = context.departureTime ? ` · ${context.departureTime}` : ""
	return `${formatDateOnly(context.departureDate)}${time}`
}

function refundLabel(value: unknown): string {
	const percent = Number(value)
	if (!Number.isFinite(percent)) return "Reembolso sujeto a revisión"
	if (percent <= 0) return "No reembolsable"
	if (percent >= 100) return "100% de reembolso"
	return `${Math.round(percent * 100) / 100}% de reembolso`
}

function freeCancellationLead(tier: any, context: TourPolicyPreviewContext): string {
	const hours = Number(tier?.hoursBeforeDeparture)
	if (Number.isFinite(hours) && hours > 0) {
		return `${hours} ${hours === 1 ? "hora" : "horas"} antes de la salida`
	}
	const configuredFreeTier = context.configuredCancellationTiers?.find(
		(configured) =>
			String(configured.penaltyType ?? "") === "percentage" && Number(configured.penaltyAmount) <= 0
	)
	const configuredHours = Number(configuredFreeTier?.hoursBeforeDeparture)
	if (Number.isFinite(configuredHours) && configuredHours > 0) {
		return `${configuredHours} ${configuredHours === 1 ? "hora" : "horas"} antes de la salida`
	}
	const days = Number(tier?.daysBeforeArrival)
	if (Number.isFinite(days) && days > 0) {
		return `${days} ${days === 1 ? "día" : "días"} antes de la salida`
	}
	return "antes de comenzar la salida"
}

export function buildTourPolicyCategoryPreview(params: {
	category: string
	snapshot: HoldPolicySnapshot
	context: TourPolicyPreviewContext
}): PolicyCategoryPreview {
	const { category, snapshot, context } = params
	const quoteNote =
		context.quoteAmount == null
			? "Se muestran porcentajes porque todavía no hay una cotización de viajeros y opción."
			: "Importe basado en la cotización seleccionada; Fastt no procesa este pago."
	if (category === "Cancellation") {
		const cancellation = snapshot.cancellation?.calculation?.cancellation
		const tiers = cancellation?.refundTiers ?? []
		const freeTier = tiers.find((tier: any) => Number(tier?.refundPercent) >= 100)
		const paidTier = [...tiers].reverse().find((tier: any) => Number(tier?.refundPercent) < 100)
		const isNonRefundable =
			tiers.length > 0 && tiers.every((tier: any) => Number(tier?.refundPercent) <= 0)

		if (isNonRefundable) {
			return {
				category,
				title: "Así lo verá el viajero",
				description: "Resumen contractual de cancelación para esta salida.",
				previewReady: true,
				items: [
					{
						key: "non_refundable",
						label: "Cancelación",
						value: "No reembolsable",
						detail: "Si el viajero cancela, no recibe reembolso de la reserva.",
					},
					{
						key: "payment_platform",
						label: "Gestión del pago",
						value: "El proveedor gestiona cualquier devolución",
						detail: "Fastt no cobra ni realiza reembolsos automáticos para esta experiencia.",
					},
				],
			}
		}
		if (!freeTier) {
			const bestRefund = tiers.reduce(
				(best: any, tier: any) =>
					Number(tier?.refundPercent) > Number(best?.refundPercent ?? -1) ? tier : best,
				null
			)
			return {
				category,
				title: "Así lo verá el viajero",
				description: "Resumen contractual de cancelación para esta salida.",
				previewReady: Boolean(snapshot.cancellation && tiers.length),
				items: [
					{
						key: "departure",
						label: context.departureDate
							? "Salida de referencia"
							: context.availabilityStepIsNext
								? "Próximo paso"
								: "Disponibilidad",
						value: departureReference(context),
					},
					{
						key: "partial_refund",
						label: "Reembolso por cancelación",
						value: refundLabel(bestRefund?.refundPercent),
						detail: "Esta condición no incluye un periodo de cancelación gratuita.",
					},
				],
			}
		}

		const deadline = context.departureDate
			? formatDeadline(cancellation?.freeCancellationDeadlineLocal)
			: null
		const freeLead = freeCancellationLead(freeTier, context)
		return {
			category,
			title: "Así lo verá el viajero",
			description: "Resumen contractual de cancelación para esta salida.",
			previewReady: Boolean(snapshot.cancellation && tiers.length),
			items: [
				{
					key: "departure",
					label: context.departureDate
						? "Próxima fecha usada en el cálculo"
						: context.availabilityStepIsNext
							? "Próximo paso"
							: "Disponibilidad",
					value: departureReference(context),
					detail: context.departureDate
						? "Se usa la próxima fecha futura con cupo; la regla se aplica a cada fecha reservada."
						: context.availabilityStepIsNext
							? "Al continuar abrirás la primera fecha con cupo y el sistema calculará su límite exacto."
							: "Abre fechas en disponibilidad para calcular el día y la hora exactos.",
				},
				{
					key: "free_cancellation",
					label: "Cancelación gratuita",
					value: deadline ? `Hasta el ${deadline}` : `Hasta ${freeLead}`,
					detail: deadline
						? timezoneDetail(context)
						: "El límite exacto depende de la fecha reservada.",
				},
				{
					key: "before_cutoff",
					label: "Si cancela antes del límite",
					value: refundLabel(freeTier?.refundPercent),
					detail: quoteNote,
				},
				{
					key: "after_cutoff",
					label: "Si cancela desde el límite",
					value: refundLabel(paidTier?.refundPercent),
				},
			],
		}
	}
	if (category === "Payment") {
		const paymentType = String(rules(snapshot, "payment").paymentType ?? "")
		return {
			category,
			title: "Así lo verá el viajero",
			description: "Forma de pago de la experiencia.",
			previewReady: paymentType === "pay_at_property",
			items: [
				{ key: "payment_recipient", label: "Pago", value: "Paga al proveedor al realizar el tour" },
				{
					key: "payment_platform",
					label: "Estado en Fastt",
					value: "Fastt no cobra, custodia ni reembolsa este pago.",
					detail: quoteNote,
				},
			],
		}
	}
	const noShow = snapshot.no_show?.calculation?.noShow
	const charge =
		noShow?.chargeType === "full"
			? "100% del total de la reserva"
			: noShow?.chargeType === "percentage"
				? `${noShow.chargeAmount}% del total de la reserva`
				: "Según la condición asignada"
	return {
		category,
		title: "Así lo verá el viajero",
		description: "Condición aplicable si no se presenta a la salida.",
		previewReady: Boolean(snapshot.no_show),
		items: [
			{ key: "departure", label: "Salida de referencia", value: departureReference(context) },
			{ key: "no_show", label: "No presentación", value: charge, detail: quoteNote },
			{
				key: "payment_platform",
				label: "Cobro",
				value: "La penalidad es contractual; Fastt no realiza un cobro automático.",
			},
		],
	}
}
