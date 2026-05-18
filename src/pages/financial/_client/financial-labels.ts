export const queueLabels: Record<string, string> = {
	needs_action_today: "Needs attention",
	blocked: "Stuck until fixed",
	ready_to_close: "Can be closed",
	recently_closed: "Closed recently",
	needs_review: "Other open work",
	reconciliation_issues: "Proof does not line up",
	refund_handoffs: "Refund follow-up",
	provider_finance: "Provider payable checks",
	evidence_issues: "Proof needs attention",
	waiting_external: "Waiting on someone else",
	resolved_history: "Closed work",
	advanced_all: "All records (advanced)",
	all_open: "Other open work",
	refund_handoff_required: "Refund follow-up",
	missing_references: "Missing proof",
	provider_finance_review: "Provider payable checks",
	snapshot_gaps: "Booking proof gaps",
	evidence_unknown: "Proof unclear",
	multi_room_review: "Multi-room review",
	clean_records: "Clean records",
	all: "All records (advanced)",
}

export const evidenceStateLabels: Record<string, string> = {
	all: "Any proof state",
	snapshot_ready: "Enough proof to review",
	handoff_pending: "Waiting for handoff",
	evidence_partial: "Some proof missing",
	evidence_matched: "Proof lines up",
	evidence_unknown: "Proof unclear",
}

export const statusLabels: Record<string, string> = {
	open: "needs attention",
	acknowledged: "someone is reviewing",
	waiting_external: "waiting on someone else",
	resolved: "closed",
	dismissed: "dismissed",
}

export const ownerLabels: Record<string, string> = {
	financial_operations: "Financial ops",
	reconciliation_ops: "Proof comparison",
	reservations: "Reservations",
	provider_followup: "Provider follow-up",
	external_finance: "External finance",
	provider_finance: "Provider payable checks",
	support: "Support context",
	none: "No owner",
}

export const handoffStatusLabels: Record<string, string> = {
	required: "Refund follow-up needed",
	acknowledged: "Follow-up started",
	waiting_external: "Waiting on someone else",
	evidence_recorded: "Refund proof received",
	closed: "Closed",
	dismissed: "Dismissed",
}

export const overlaySourceLabels: Record<string, string> = {
	derived_only: "derived signal",
	persisted_overlay: "persisted review",
	persisted: "persisted review",
	visibility_only: "visibility only",
}

export const workItemLabels: Record<string, string> = {
	clean_record: "No review needed",
	provider_finance_review: "Provider payable check",
	refund_handoff_required: "Refund follow-up needed",
	missing_payment_reference: "Payment proof missing",
	missing_settlement_reference: "Settlement proof missing",
	missing_refund_reference: "Refund proof missing",
	incomplete_contract_snapshot: "Booking proof incomplete",
	legacy_snapshot_compatibility: "Older booking proof needs care",
	evidence_unknown: "Proof is unclear",
	multi_room_review: "Multi-room review",
}

export const providerFinanceQueueLabels: Record<string, string> = {
	provider_profile_incomplete: "Provider profile incomplete",
	commission_snapshot_missing: "Commission details missing",
	provider_finance_dispute: "Proof must be reviewed first",
	provider_statement_pending: "Statement draft needs a look",
	payout_reference_missing: "External finance reference missing",
	payout_blocked: "Provider payable check is stuck",
	payable_blocked: "Provider payable check is stuck",
	statement_stale: "Statement draft needs another look",
	reconciliation_blocked: "Proof must be reviewed first",
	commission_missing: "Commission details missing",
	reference_missing: "External finance reference missing",
	provider_finance_review: "Provider payable check",
}

export const reconciliationStatusLabels: Record<string, string> = {
	matched: "proof matched",
	mismatch: "amount mismatch",
	missing_payment: "payment proof missing",
	missing_settlement: "settlement proof missing",
	currency_mismatch: "currency mismatch",
}

export const mismatchReasonLabels: Record<string, string> = {
	payment_amount_mismatch: "Payment amount differs from contract snapshot",
	settlement_amount_mismatch: "Settlement amount differs from visible payment proof",
	duplicate_external_reference: "Duplicate external reference visible",
	missing_capture_reference: "Capture proof missing",
	refund_without_matching_cancellation: "Refund proof without matching cancellation",
	stale_review: "Proof changed after the last review",
	unmatched_payment_transaction: "Unmatched payment proof",
	unmatched_settlement_record: "Unmatched settlement proof",
}

export const staleReasonLabels: Record<string, string> = {
	commission_currency_mismatch: "Commission currency differs from booking currency",
	commission_basis_mismatch: "Commission basis no longer matches contract snapshots",
	commission_amount_stale: "Commission amount changed since the snapshot",
	payable_currency_mismatch: "Payable currency differs from booking currency",
	payable_gross_amount_stale: "Gross amount changed since payable snapshot",
	payable_commission_amount_stale: "Commission amount changed since payable snapshot",
	payable_tax_amount_stale: "Tax amount changed since payable snapshot",
	payable_net_amount_stale: "Net payable changed since payable snapshot",
}

export function humanize(value: unknown, fallback = "-"): string {
	const raw = String(value ?? "").trim()
	if (!raw) return fallback
	return raw.replaceAll("_", " ")
}

export function labelFrom(map: Record<string, string>, value: unknown, fallback = "-"): string {
	const key = String(value ?? "").trim()
	return map[key] ?? humanize(key, fallback)
}
