import { labelFrom, mismatchReasonLabels, reconciliationStatusLabels } from "./financial-labels"

export function reconciliationIssueLabel(match: any): string | null {
	if (!match) return null
	const reasons = Array.isArray(match.mismatchReasons) ? match.mismatchReasons : []
	if (reasons.length) return labelFrom(mismatchReasonLabels, reasons[0])
	if (match.reviewState === "stale") return "Review is stale after evidence changed"
	if (match.status && match.status !== "matched")
		return labelFrom(reconciliationStatusLabels, match.status)
	return null
}

export function reconciliationIssueDescription(match: any): string {
	if (!match) return "No reconciliation comparison is visible for this booking yet."
	const status = labelFrom(reconciliationStatusLabels, match.status)
	const reasons = Array.isArray(match.mismatchReasons)
		? match.mismatchReasons.map((reason: string) => labelFrom(mismatchReasonLabels, reason))
		: []
	if (match.reviewState === "stale") {
		return "This comparison was reviewed before evidence changed. Review the updated evidence again."
	}
	if (!reasons.length && match.status === "matched") {
		return "Contract, payment evidence and settlement evidence are aligned for review visibility."
	}
	return `${status}. ${reasons.join(", ") || "Review the evidence before closing."}`
}

export function duplicateReferenceDescription(signal: any): string {
	const reference = String(signal?.externalReference || "external reference")
	const count = Array.isArray(signal?.bookingIds) ? signal.bookingIds.length : 0
	return `External reference ${reference} appears on ${count || "multiple"} booking record(s). Confirm which booking owns the evidence.`
}

export function unmatchedEvidenceDescription(kind: "payment" | "settlement", item: any): string {
	const reference =
		kind === "payment"
			? String(item?.externalReference || "payment evidence")
			: String(item?.settlementReference || "settlement evidence")
	return `${reference} is visible but not matched to a booking. Review evidence ownership before using it in reconciliation.`
}
