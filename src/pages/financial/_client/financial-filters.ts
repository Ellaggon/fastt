import type { FinancialActorFilter } from "./financial-actor-filters"
import { actorMatchesRow } from "./financial-actor-filters"
import type { FinancialRowViewModel } from "./financial-row-view-model"

export type FinancialWorkspaceFilterState = {
	queue: string
	evidenceState: string
	actor: FinancialActorFilter
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

export function isCleanFinancialRecord(item: any): boolean {
	return !item?.workflow && !item?.operation?.operationalException?.hasOpenException
}

export function queueMatchesRow(params: {
	item: any
	row: FinancialRowViewModel
	queue: string
	isTerminalReview: boolean
}): boolean {
	const { item, row, queue, isTerminalReview } = params
	if (queue === "advanced_all" || queue === "all") return true
	if (queue === "needs_review" || queue === "all_open") {
		return !isTerminalReview && !isCleanFinancialRecord(item)
	}
	if (queue === "resolved_history") return row.queue === "resolved_history"
	if (queue === "refund_handoffs" || queue === "refund_handoff_required")
		return row.queue === "refund_handoffs"
	if (queue === "provider_finance" || queue === "provider_finance_review")
		return row.queue === "provider_finance"
	if (queue === "reconciliation_issues") return row.queue === "reconciliation_issues"
	if (queue === "evidence_issues") return row.queue === "evidence_issues"
	if (queue === "waiting_external") return row.queue === "waiting_external"
	if (queue === "clean_records") return isCleanFinancialRecord(item)
	if (queue === "missing_references") {
		return hasAnyCode(item, [
			"missing_payment_reference",
			"missing_settlement_reference",
			"missing_refund_reference",
		])
	}
	if (queue === "snapshot_gaps") {
		return hasAnyCode(item, ["incomplete_contract_snapshot", "legacy_snapshot_compatibility"])
	}
	return hasAnyCode(item, [queue])
}

export function filterFinancialRows(params: {
	items: any[]
	filters: FinancialWorkspaceFilterState
	rowFor: (item: any) => FinancialRowViewModel
	isTerminalReview: (item: any) => boolean
	isSuppressed: (item: any) => boolean
}): any[] {
	const { items, filters, rowFor, isTerminalReview, isSuppressed } = params
	return items.filter((item) => {
		if (isSuppressed(item)) return false
		const row = rowFor(item)
		const stateMatches =
			filters.evidenceState === "all" ||
			Boolean(item?.providerFinance) ||
			item?.operation?.evidenceAlignment?.state === filters.evidenceState
		return (
			stateMatches &&
			queueMatchesRow({
				item,
				row,
				queue: filters.queue,
				isTerminalReview: isTerminalReview(item),
			}) &&
			actorMatchesRow(filters.actor, row)
		)
	})
}

export function countFinancialQueue(params: {
	items: any[]
	queue: string
	rowFor: (item: any) => FinancialRowViewModel
	isTerminalReview: (item: any) => boolean
}): number {
	return params.items.filter((item: any) =>
		queueMatchesRow({
			item,
			row: params.rowFor(item),
			queue: params.queue,
			isTerminalReview: params.isTerminalReview(item),
		})
	).length
}
