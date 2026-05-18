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
			label: "Payment proof",
			state: hasDuplicates ? "duplicate" : payment ? "visible" : "missing",
			count: payment,
			description: payment ? "Payment proof is visible." : "Payment proof is not visible yet.",
		},
		{
			key: "settlement",
			label: "Settlement proof",
			state: settlement ? "visible" : "missing",
			count: settlement,
			description: settlement
				? "Settlement proof is visible."
				: "Settlement proof is not visible yet.",
		},
		{
			key: "refund",
			label: "Refund proof",
			state: refund ? "visible" : "missing",
			count: refund,
			description: refund
				? "Refund proof is visible."
				: "Refund proof is not visible for this booking.",
		},
		{
			key: "reference",
			label: "External references saved",
			state: references ? "visible" : "missing",
			count: references,
			description: references
				? `${references} external reference(s) are available for review.`
				: "No stable external reference is visible yet.",
		},
	]
}

export function evidenceStateCopy(state: string): string {
	return humanize(state || "missing")
}
