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
			label: "Payment evidence",
			state: hasDuplicates ? "duplicate" : payment ? "visible" : "missing",
			count: payment,
			description: payment
				? "Payment evidence is visible."
				: "Payment evidence is not visible yet.",
		},
		{
			key: "settlement",
			label: "Settlement evidence",
			state: settlement ? "visible" : "missing",
			count: settlement,
			description: settlement
				? "Settlement evidence is visible."
				: "Settlement evidence is not visible yet.",
		},
		{
			key: "refund",
			label: "Refund evidence",
			state: refund ? "visible" : "missing",
			count: refund,
			description: refund
				? "Refund evidence is visible."
				: "Refund evidence is not visible for this booking.",
		},
		{
			key: "reference",
			label: "References recorded",
			state: references ? "visible" : "missing",
			count: references,
			description: references
				? `${references} reference record(s) visible for review.`
				: "No stable reference is visible yet.",
		},
	]
}

export function evidenceStateCopy(state: string): string {
	return humanize(state || "missing")
}
