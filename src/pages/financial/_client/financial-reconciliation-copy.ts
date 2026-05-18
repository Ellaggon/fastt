import { labelFrom, mismatchReasonLabels, reconciliationStatusLabels } from "./financial-labels"

export function reconciliationIssueLabel(match: any): string | null {
	if (!match) return null
	const reasons = Array.isArray(match.mismatchReasons) ? match.mismatchReasons : []
	if (reasons.length) return labelFrom(mismatchReasonLabels, reasons[0])
	if (match.reviewState === "stale") return "Proof changed after the last review"
	if (match.status && match.status !== "matched")
		return labelFrom(reconciliationStatusLabels, match.status)
	return null
}

export function reconciliationIssueDescription(match: any): string {
	if (!match) return "No proof comparison is visible for this booking yet."
	const status = labelFrom(reconciliationStatusLabels, match.status)
	const reasons = Array.isArray(match.mismatchReasons)
		? match.mismatchReasons.map((reason: string) => labelFrom(mismatchReasonLabels, reason))
		: []
	if (match.reviewState === "stale") {
		return "Someone reviewed this before the proof changed. Look at the new proof before closing."
	}
	if (!reasons.length && match.status === "matched") {
		return "Booking, payment, and settlement proof line up for review."
	}
	return `${status}. ${reasons.join(", ") || "Compare the proof before closing."}`
}

export function explainReconciliationIssue(match: any): string {
	return reconciliationIssueDescription(match)
}

export function explainEvidenceGap(kind: "payment" | "settlement" | "refund" | "capture"): string {
	const labels: Record<typeof kind, string> = {
		payment: "Payment proof is not visible yet. Add the external reference when it is available.",
		settlement:
			"Settlement proof is not visible yet. Keep the provider payable check stuck until proof can be reviewed.",
		refund: "Refund proof is not visible yet. Review refund follow-up context before closing.",
		capture: "Capture proof is not visible yet. Review external PSP proof before closing.",
	}
	return labels[kind]
}

export function explainStaleReview(): string {
	return "Someone reviewed this before the proof changed. Look at the new proof before closing."
}

export function duplicateReferenceDescription(signal: any): string {
	const reference = String(signal?.externalReference || "external reference")
	const count = Array.isArray(signal?.bookingIds) ? signal.bookingIds.length : 0
	return `External reference ${reference} appears on ${count || "multiple"} booking record(s). Confirm which booking owns this proof.`
}

export function unmatchedEvidenceDescription(kind: "payment" | "settlement", item: any): string {
	const reference =
		kind === "payment"
			? String(item?.externalReference || "payment evidence")
			: String(item?.settlementReference || "settlement evidence")
	return `${reference} is visible but not linked to a booking. Confirm which booking owns this proof before closing.`
}
