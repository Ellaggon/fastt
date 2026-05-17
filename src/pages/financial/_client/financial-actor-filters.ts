import type { FinancialRowViewModel } from "./financial-row-view-model"

export type FinancialActorFilter =
	| "all"
	| "financial_operations"
	| "reconciliation_ops"
	| "provider_finance"
	| "provider_followup"
	| "support"
	| "admin"

export const actorFilterOptions: Array<{ value: FinancialActorFilter; label: string }> = [
	{ value: "all", label: "All operators" },
	{ value: "financial_operations", label: "Financial ops" },
	{ value: "reconciliation_ops", label: "Reconciliation ops" },
	{ value: "provider_finance", label: "Provider finance" },
	{ value: "provider_followup", label: "Provider follow-up" },
	{ value: "support", label: "Support" },
	{ value: "admin", label: "Admin review" },
]

function issueKind(row: FinancialRowViewModel): string {
	return String(row.item?.evidenceIssue?.kind || "")
}

function isReconciliationEvidenceIssue(row: FinancialRowViewModel): boolean {
	return ["duplicate_reference", "unmatched_payment", "unmatched_settlement"].includes(
		issueKind(row)
	)
}

export function actorMatchesRow(actor: FinancialActorFilter, row: FinancialRowViewModel): boolean {
	if (actor === "all") return true
	if (actor === "financial_operations") {
		return (
			["needs_review", "waiting_external"].includes(row.queue) ||
			(row.queue === "evidence_issues" && !isReconciliationEvidenceIssue(row))
		)
	}
	if (actor === "reconciliation_ops") {
		return row.queue === "reconciliation_issues" || isReconciliationEvidenceIssue(row)
	}
	if (actor === "provider_finance") {
		return row.queue === "provider_finance" || row.owner === "provider_finance"
	}
	if (actor === "provider_followup") {
		return row.owner === "provider_followup" || row.owner === "external_finance"
	}
	if (actor === "support") {
		return (
			row.queue === "refund_handoffs" ||
			row.owner === "support" ||
			row.owner === "reservations" ||
			row.staleState === "waiting_external"
		)
	}
	if (actor === "admin") {
		return (
			row.queue === "advanced_all" ||
			row.operationalState === "unknown" ||
			row.staleState === "unknown" ||
			row.sourceKind === "visibility only"
		)
	}
	return true
}

export function actorNoiseHint(actor: FinancialActorFilter): string {
	const hints: Record<FinancialActorFilter, string> = {
		all: "All visible operational work.",
		financial_operations: "Review, evidence and waiting external items.",
		reconciliation_ops: "Mismatches, duplicates, unmatched evidence and stale comparisons.",
		provider_finance:
			"Payable visibility blockers, statement freshness and provider finance dependencies.",
		provider_followup: "Provider or external finance follow-up work.",
		support: "Refund handoffs, refund evidence and waiting external context.",
		admin: "Degraded states and operational inconsistencies.",
	}
	return hints[actor] || hints.all
}
