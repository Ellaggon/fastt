import { labelFrom, mismatchReasonLabels, reconciliationStatusLabels } from "./financial-labels"

export function reconciliationIssueLabel(match: any): string | null {
	if (!match) return null
	const reasons = Array.isArray(match.mismatchReasons) ? match.mismatchReasons : []
	if (reasons.length) return labelFrom(mismatchReasonLabels, reasons[0])
	if (match.reviewState === "stale")
		return "Los comprobantes cambiaron después de la última revisión"
	if (match.status && match.status !== "matched")
		return labelFrom(reconciliationStatusLabels, match.status)
	return null
}

export function reconciliationIssueDescription(match: any): string {
	if (!match) return "Todavía no hay importes suficientes para comparar esta reserva."
	const status = labelFrom(reconciliationStatusLabels, match.status)
	const reasons = Array.isArray(match.mismatchReasons)
		? match.mismatchReasons.map((reason: string) => labelFrom(mismatchReasonLabels, reason))
		: []
	if (match.reviewState === "stale") {
		return "Los comprobantes cambiaron después de la última revisión. Revisa la información nueva antes de cerrar."
	}
	if (!reasons.length && match.status === "matched") {
		return "El importe de la reserva, el cobro y la liquidación coinciden."
	}
	return `${status}. ${reasons.join(", ") || "Compara los importes antes de cerrar."}`
}

export function explainReconciliationIssue(match: any): string {
	return reconciliationIssueDescription(match)
}

export function explainEvidenceGap(kind: "payment" | "settlement" | "refund" | "capture"): string {
	const labels: Record<typeof kind, string> = {
		payment:
			"Todavía no hay un comprobante de cobro. Registra la referencia externa cuando esté disponible.",
		settlement:
			"Todavía no hay un comprobante de liquidación. El pago al proveedor seguirá bloqueado hasta revisarlo.",
		refund: "Todavía no hay un comprobante de reembolso. Revisa el seguimiento antes de cerrar.",
		capture:
			"Todavía no hay una referencia de cobro. Revisa la información del procesador antes de cerrar.",
	}
	return labels[kind]
}

export function explainStaleReview(): string {
	return "Los comprobantes cambiaron después de la última revisión. Revisa la información nueva antes de cerrar."
}

export function duplicateReferenceDescription(signal: any): string {
	const reference = String(signal?.externalReference || "referencia sin identificar")
	const count = Array.isArray(signal?.bookingIds) ? signal.bookingIds.length : 0
	const bookingCount = count
		? `${count} ${count === 1 ? "reserva" : "reservas"}`
		: "varias reservas"
	return `La referencia externa ${reference} aparece en ${bookingCount}. Confirma a cuál corresponde.`
}

export function unmatchedEvidenceDescription(kind: "payment" | "settlement", item: any): string {
	const reference =
		kind === "payment"
			? String(item?.externalReference || "cobro sin identificar")
			: String(item?.settlementReference || "liquidación sin identificar")
	return `${reference} está visible, pero no está asociado a una reserva. Confirma a cuál corresponde antes de cerrar.`
}
