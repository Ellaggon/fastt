export const queueLabels: Record<string, string> = {
	needs_review: "Needs review",
	reconciliation_issues: "Reconciliation issues",
	refund_handoffs: "Refund handoffs",
	provider_finance: "Provider finance",
	evidence_issues: "Evidence issues",
	waiting_external: "Waiting external",
	resolved_history: "Resolved / historical",
	advanced_all: "Advanced: all records",
	all_open: "Needs review",
	refund_handoff_required: "Refund handoffs",
	missing_references: "Missing evidence",
	provider_finance_review: "Provider finance",
	snapshot_gaps: "Snapshot gaps",
	evidence_unknown: "Unknown evidence",
	multi_room_review: "Multi-room review",
	clean_records: "Clean records",
	all: "Advanced: all records",
}

export const evidenceStateLabels: Record<string, string> = {
	all: "All evidence states",
	snapshot_ready: "Evidence ready",
	handoff_pending: "Handoff pending",
	evidence_partial: "Partial evidence",
	evidence_matched: "Evidence matched",
	evidence_unknown: "Unknown evidence",
}

export const statusLabels: Record<string, string> = {
	open: "open",
	acknowledged: "acknowledged",
	waiting_external: "waiting external",
	resolved: "review resolved",
	dismissed: "dismissed",
}

export const ownerLabels: Record<string, string> = {
	financial_operations: "Financial ops",
	reservations: "Reservations",
	provider_followup: "Provider follow-up",
	external_finance: "External finance",
	provider_finance: "Provider finance",
	support: "Support context",
	none: "No owner",
}

export const handoffStatusLabels: Record<string, string> = {
	required: "Refund handoff",
	acknowledged: "Handoff acknowledged",
	waiting_external: "Waiting external review",
	evidence_recorded: "Refund evidence visible",
	closed: "Review closed",
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
	provider_finance_review: "Provider finance review",
	refund_handoff_required: "Refund handoff required",
	missing_payment_reference: "Payment evidence missing",
	missing_settlement_reference: "Settlement evidence missing",
	missing_refund_reference: "Refund evidence missing",
	incomplete_contract_snapshot: "Contract snapshot incomplete",
	legacy_snapshot_compatibility: "Legacy snapshot visibility",
	evidence_unknown: "Evidence state unknown",
	multi_room_review: "Multi-room review",
}

export const providerFinanceQueueLabels: Record<string, string> = {
	provider_profile_incomplete: "Provider profile incomplete",
	commission_snapshot_missing: "Commission basis missing",
	provider_finance_dispute: "Reconciliation blocks payable visibility",
	provider_statement_pending: "Statement needs review",
	payout_reference_missing: "External finance reference missing",
	payout_blocked: "Payable visibility blocked",
	payable_blocked: "Payable visibility blocked",
	statement_stale: "Statement freshness needs review",
	reconciliation_blocked: "Reconciliation blocks payable visibility",
	commission_missing: "Commission basis missing",
	reference_missing: "External finance reference missing",
	provider_finance_review: "Provider finance review",
}

export const reconciliationStatusLabels: Record<string, string> = {
	matched: "evidence matched",
	mismatch: "amount mismatch",
	missing_payment: "payment evidence missing",
	missing_settlement: "settlement evidence missing",
	currency_mismatch: "currency mismatch",
}

export const mismatchReasonLabels: Record<string, string> = {
	payment_amount_mismatch: "Payment amount differs from contract snapshot",
	settlement_amount_mismatch: "Settlement amount differs from visible payment evidence",
	duplicate_external_reference: "Duplicate external reference visible",
	missing_capture_reference: "Capture evidence missing",
	refund_without_matching_cancellation: "Refund evidence without matching cancellation",
	stale_review: "Review is stale after evidence changed",
	unmatched_payment_transaction: "Unmatched payment evidence",
	unmatched_settlement_record: "Unmatched settlement evidence",
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
