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
	{ value: "reconciliation_ops", label: "Proof comparison" },
	{ value: "provider_finance", label: "Provider payable checks" },
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
		all: "All visible cases that may need attention.",
		financial_operations: "Open cases, missing proof, and items waiting on someone else.",
		reconciliation_ops: "Amounts that do not line up, duplicate references, and unmatched proof.",
		provider_finance: "Provider payable checks, statement drafts, and evidence dependencies.",
		provider_followup: "Provider or external finance follow-up work.",
		support: "Refund follow-ups, refund proof, and cases waiting on someone else.",
		admin: "System inconsistencies and records that need careful inspection.",
	}
	return hints[actor] || hints.all
}
