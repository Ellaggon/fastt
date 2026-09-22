import type { HoldPolicySnapshot } from "@/modules/policies/public"
import type { PolicyCategoryPreview } from "./buildPolicyCategoryPreview"

export type TourPolicyPreviewContext = {
	departureDate: string | null
	departureTime: string | null
	timezone: string | null
	currency: string | null
	quoteAmount: number | null
}

function rules(snapshot: HoldPolicySnapshot, category: "payment" | "no_show") {
	return Object.fromEntries(
		(snapshot[category]?.rules ?? [])
			.filter((rule: any) => rule?.ruleKey)
			.map((rule: any) => [String(rule.ruleKey), rule.ruleValue])
	)
}

function departureReference(context: TourPolicyPreviewContext) {
	if (!context.departureDate || !context.departureTime) {
		return "Selecciona una salida para calcular una fecha y hora exactas."
	}
	return `${context.departureDate} · ${context.departureTime}${context.timezone ? ` (${context.timezone})` : ""}`
}

export function buildTourPolicyCategoryPreview(params: {
	category: string
	snapshot: HoldPolicySnapshot
	context: TourPolicyPreviewContext
}): PolicyCategoryPreview {
	const { category, snapshot, context } = params
	const quoteNote =
		context.quoteAmount == null
			? "No hay una cotización de esta salida: se muestran porcentajes, no importes."
			: "Importe basado en la cotización seleccionada; Fastt no procesa este pago."
	if (category === "Cancellation") {
		const cancellation = snapshot.cancellation?.calculation?.cancellation
		const deadline = cancellation?.freeCancellationDeadlineLocal
		return {
			category,
			title: "Así lo verá el viajero",
			description: "Resumen contractual de cancelación para esta salida; no es una liquidación.",
			previewReady: Boolean(snapshot.cancellation),
			items: [
				{ key: "departure", label: "Salida de referencia", value: departureReference(context) },
				{
					key: "free_cancellation",
					label: "Cancelación gratuita",
					value: deadline || "Según el plazo antes de la salida",
					detail: context.departureDate
						? "Calculado respecto de la salida programada."
						: "Falta fecha de salida para un límite exacto.",
				},
				{
					key: "cutoff_scenarios",
					label: "Antes, en y después del corte",
					value: "La penalidad se aplica según el tramo vigente en ese instante.",
					detail: quoteNote,
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
