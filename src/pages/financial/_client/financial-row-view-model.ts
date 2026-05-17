import { labelFrom, ownerLabels, workItemLabels } from "./financial-labels"
import {
	duplicateReferenceDescription,
	reconciliationIssueDescription,
	reconciliationIssueLabel,
	unmatchedEvidenceDescription,
} from "./financial-reconciliation-copy"

export type FinancialOperationalQueue =
	| "needs_review"
	| "reconciliation_issues"
	| "refund_handoffs"
	| "provider_finance"
	| "evidence_issues"
	| "waiting_external"
	| "resolved_history"
	| "advanced_all"

export type FinancialRowViewModel = {
	id: string
	queue: FinancialOperationalQueue
	title: string
	description: string
	bookingId: string
	providerId: string
	owner: string
	ownerLabel: string
	blocker: string
	staleState: string
	evidenceSummary: string
	nextAction: string
	severity: string
	ageLabel: string
	operationalState: string
	sourceKind: string
	item: any
}

function exceptionCodes(item: any): string[] {
	return Array.isArray(item?.operation?.operationalException?.all)
		? item.operation.operationalException.all.map((entry: any) => String(entry?.code || ""))
		: []
}

function hasAnyCode(item: any, codes: string[]): boolean {
	return String(item?.code || "")
		? codes.includes(String(item.code))
		: exceptionCodes(item).some((code) => codes.includes(code))
}

function providerFinancePrimaryDetail(item: any): any | null {
	const details = Array.isArray(item?.providerFinance?.blockingDetails)
		? item.providerFinance.blockingDetails
		: []
	return details[0] || null
}

function primaryBlocker(item: any, reconciliation: any): string {
	const financeDetail = providerFinancePrimaryDetail(item)
	if (financeDetail?.reason) return financeDetail.reason
	const reconciliationIssue = reconciliationIssueLabel(reconciliation)
	if (reconciliationIssue) return reconciliationIssue
	if (hasAnyCode(item, ["refund_handoff_required"])) return "Refund handoff needs review."
	if (hasAnyCode(item, ["missing_payment_reference"])) return "Payment evidence is missing."
	if (hasAnyCode(item, ["missing_settlement_reference"])) return "Settlement evidence is missing."
	if (hasAnyCode(item, ["missing_refund_reference"])) return "Refund evidence is missing."
	if (hasAnyCode(item, ["incomplete_contract_snapshot"])) return "Contract snapshot needs review."
	if (item?.code === "clean_record") return "No open blocker visible."
	return item?.reason || "Operational review needed."
}

function nextActionFor(item: any, reconciliation: any): string {
	const financeDetail = providerFinancePrimaryDetail(item)
	if (financeDetail?.nextOperationalAction) return financeDetail.nextOperationalAction
	if (reconciliation?.reviewState === "stale")
		return "Review updated evidence and mark comparison reviewed."
	if (reconciliation && reconciliation.status !== "matched")
		return "Review evidence comparison before closing."
	if (hasAnyCode(item, ["refund_handoff_required"])) return "Review refund handoff evidence."
	if (
		hasAnyCode(item, [
			"missing_payment_reference",
			"missing_settlement_reference",
			"missing_refund_reference",
		])
	)
		return "Record evidence when an external reference is available."
	if (item?.persistedId && !["resolved", "dismissed"].includes(String(item.status || "open")))
		return "Acknowledge, resolve, or dismiss the operational review."
	if (item?.code === "clean_record") return "No action needed."
	return "Open review details."
}

function queueFor(item: any, reconciliation: any): FinancialOperationalQueue {
	if (item?.evidenceIssue) return "evidence_issues"
	if (item?.providerFinance) return "provider_finance"
	if (hasAnyCode(item, ["refund_handoff_required"])) return "refund_handoffs"
	if (
		reconciliation &&
		(reconciliation.status !== "matched" ||
			reconciliation.reviewState === "stale" ||
			(Array.isArray(reconciliation.mismatchReasons) && reconciliation.mismatchReasons.length > 0))
	) {
		return "reconciliation_issues"
	}
	if (
		hasAnyCode(item, [
			"missing_payment_reference",
			"missing_settlement_reference",
			"missing_refund_reference",
			"evidence_unknown",
		])
	)
		return "evidence_issues"
	if (String(item?.status || "") === "waiting_external") return "waiting_external"
	if (["resolved", "dismissed"].includes(String(item?.status || ""))) return "resolved_history"
	if (item?.code === "clean_record") return "advanced_all"
	return "needs_review"
}

function evidenceSummaryFor(item: any, referenceCounts: any): string {
	if (item?.evidenceIssue?.kind === "duplicate_reference") return "Duplicate evidence visible"
	if (item?.evidenceIssue?.kind === "unmatched_payment") return "Unmatched payment evidence"
	if (item?.evidenceIssue?.kind === "unmatched_settlement") return "Unmatched settlement evidence"
	return `Payment: ${referenceCounts.payment} · Settlement: ${referenceCounts.settlement} · Refund: ${referenceCounts.refund} · Invoice: ${referenceCounts.invoice}`
}

export function buildFinancialRowViewModel(params: {
	item: any
	reconciliation: any
	referenceCounts: any
	ageLabel: string
	sourceKind: string
}): FinancialRowViewModel {
	const { item, reconciliation, referenceCounts } = params
	const evidenceIssue = item?.evidenceIssue
	const financeDetail = providerFinancePrimaryDetail(item)
	const title = evidenceIssue
		? evidenceIssue.title
		: item?.code
			? labelFrom(workItemLabels, item.code)
			: "Operational review"
	const description = evidenceIssue
		? evidenceIssue.description
		: item?.providerFinance
			? financeDetail?.reason || "Provider finance visibility needs operational review."
			: reconciliation && reconciliation.status !== "matched"
				? reconciliationIssueDescription(reconciliation)
				: item?.reason || "Review the operational evidence for this booking."
	const owner = String(
		evidenceIssue?.owner || financeDetail?.owner || item?.nextOwner || "financial_operations"
	)
	const queue = queueFor(item, reconciliation)
	return {
		id: String(item?.id || `${item?.bookingId || ""}:${item?.code || "review"}`),
		queue,
		title,
		description,
		bookingId: String(item?.bookingId || ""),
		providerId: String(item?.providerId || ""),
		owner,
		ownerLabel: labelFrom(ownerLabels, owner),
		blocker: evidenceIssue?.blocker || primaryBlocker(item, reconciliation),
		staleState: String(
			item?.providerFinance?.snapshotLifecycle?.freshness ||
				reconciliation?.reviewState ||
				item?.operation?.evidenceAlignment?.state ||
				"fresh"
		),
		evidenceSummary: evidenceSummaryFor(item, referenceCounts),
		nextAction: evidenceIssue?.nextAction || nextActionFor(item, reconciliation),
		severity: String(item?.severity || evidenceIssue?.severity || "review"),
		ageLabel: params.ageLabel,
		operationalState: String(item?.status || reconciliation?.status || "open"),
		sourceKind: params.sourceKind,
		item,
	}
}

export function buildDuplicateReferenceWorkItem(signal: any): any {
	const externalReference = String(signal?.externalReference || "unknown_reference")
	const bookingIds = Array.isArray(signal?.bookingIds) ? signal.bookingIds : []
	return {
		id: `evidence-duplicate:${externalReference}`,
		bookingId: String(bookingIds[0] || ""),
		providerId: String(signal?.providerId || ""),
		code: "duplicate_external_reference",
		status: "open",
		nextOwner: "financial_operations",
		overlaySource: "visibility_only",
		evidenceIssue: {
			kind: "duplicate_reference",
			title: "Duplicate external reference",
			description: duplicateReferenceDescription(signal),
			blocker: "External reference is visible on multiple booking records.",
			nextAction: "Confirm evidence ownership before closing the review.",
			owner: "reconciliation_ops",
			severity: "review",
		},
	}
}

export function buildUnmatchedEvidenceWorkItem(kind: "payment" | "settlement", row: any): any {
	const reference =
		kind === "payment"
			? String(row?.externalReference || row?.id || "payment")
			: String(row?.settlementReference || row?.id || "settlement")
	const rawBookingId = String(row?.bookingId || "")
	const bookingId = rawBookingId.startsWith("unmatched:") ? "" : rawBookingId
	return {
		id: `evidence-unmatched:${kind}:${reference}`,
		bookingId,
		providerId: String(row?.providerId || ""),
		code: kind === "payment" ? "unmatched_payment_transaction" : "unmatched_settlement_record",
		status: "open",
		nextOwner: "financial_operations",
		overlaySource: "visibility_only",
		evidenceIssue: {
			kind: kind === "payment" ? "unmatched_payment" : "unmatched_settlement",
			title: kind === "payment" ? "Unmatched payment evidence" : "Unmatched settlement evidence",
			description: unmatchedEvidenceDescription(kind, row),
			blocker: "Evidence is visible but not matched to a booking.",
			nextAction: "Review external reference ownership before using this evidence.",
			owner: "reconciliation_ops",
			severity: "review",
		},
	}
}
