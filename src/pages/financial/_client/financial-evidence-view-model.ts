import { humanize } from "./financial-labels"

export type FinancialEvidenceGroup = {
	key: "payment" | "settlement" | "refund" | "reference"
	label: string
	state: "visible" | "missing" | "duplicate" | "stale" | "waiting_external"
	count: number
	description: string
}

function countByType(entries: any[], type: string): number {
	return entries.filter((entry) => entry.type === type).length
}

export function buildEvidenceGroups(
	entries: any[],
	duplicateSignals: any[] = []
): FinancialEvidenceGroup[] {
	const payment = countByType(entries, "payment_evidence")
	const settlement = countByType(entries, "settlement_evidence")
	const refund = countByType(entries, "refund_evidence")
	const references = entries.length
	const hasDuplicates = duplicateSignals.length > 0
	return [
		{
			key: "payment",
			label: "Comprobante de cobro",
			state: hasDuplicates ? "duplicate" : payment ? "visible" : "missing",
			count: payment,
			description: payment
				? "El comprobante de cobro está disponible."
				: "Todavía no hay un comprobante de cobro.",
		},
		{
			key: "settlement",
			label: "Comprobante de liquidación",
			state: settlement ? "visible" : "missing",
			count: settlement,
			description: settlement
				? "El comprobante de liquidación está disponible."
				: "Todavía no hay un comprobante de liquidación.",
		},
		{
			key: "refund",
			label: "Comprobante de reembolso",
			state: refund ? "visible" : "missing",
			count: refund,
			description: refund
				? "El comprobante de reembolso está disponible."
				: "No hay un comprobante de reembolso para esta reserva.",
		},
		{
			key: "reference",
			label: "Referencias externas registradas",
			state: references ? "visible" : "missing",
			count: references,
			description: references
				? `${references} referencia(s) externa(s) disponibles para revisión.`
				: "Todavía no hay una referencia externa estable.",
		},
	]
}

export function evidenceStateCopy(state: string): string {
	const labels: Record<string, string> = {
		visible: "Disponible",
		missing: "Faltante",
		duplicate: "Duplicado",
		stale: "Requiere otra revisión",
		waiting_external: "Esperando respuesta",
	}
	return labels[state] || humanize(state || "missing")
}
