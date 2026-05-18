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

function isWaitingExternalRow(item: any, row: FinancialRowViewModel): boolean {
	return (
		row.queue === "waiting_external" ||
		String(item?.status || "") === "waiting_external" ||
		String(row.operationalState || "") === "waiting_external" ||
		String(row.staleState || "") === "waiting_external"
	)
}

function isClosedRow(row: FinancialRowViewModel, isTerminalReview: boolean): boolean {
	return isTerminalReview || row.queue === "resolved_history"
}

function isBlockedRow(row: FinancialRowViewModel): boolean {
	if (row.queue === "provider_finance" && row.operationalState !== "provider_finance_review") {
		return true
	}
	if (["reconciliation_issues", "evidence_issues", "refund_handoffs"].includes(row.queue)) {
		return true
	}
	return (
		String(row.severity || "") === "blocked" ||
		(Boolean(row.blocker) &&
			![
				"no open blocker visible.",
				"no provider finance blocker is visible.",
				"nothing is stopping this case.",
				"nothing is stopping the provider payable check.",
			].includes(String(row.blocker).toLowerCase()))
	)
}

function isReadyToCloseRow(
	item: any,
	row: FinancialRowViewModel,
	isTerminalReview: boolean
): boolean {
	if (isClosedRow(row, isTerminalReview) || isWaitingExternalRow(item, row)) return false
	if (!item?.persistedId) return false
	const status = String(item?.status || "open")
	const hasReviewAction = row.nextAction.toLowerCase().includes("resolve")
	const noVisibleBlocker = [
		"no open blocker visible.",
		"no provider finance blocker is visible.",
		"nothing is stopping this case.",
		"nothing is stopping the provider payable check.",
	].includes(String(row.blocker || "").toLowerCase())
	return status === "acknowledged" || hasReviewAction || noVisibleBlocker
}

export function queueMatchesRow(params: {
	item: any
	row: FinancialRowViewModel
	queue: string
	isTerminalReview: boolean
}): boolean {
	const { item, row, queue, isTerminalReview } = params
	if (queue === "advanced_all" || queue === "all") return true
	if (queue === "needs_action_today") {
		return (
			!isClosedRow(row, isTerminalReview) &&
			!isCleanFinancialRecord(item) &&
			!isWaitingExternalRow(item, row)
		)
	}
	if (queue === "blocked") {
		return (
			!isClosedRow(row, isTerminalReview) && !isWaitingExternalRow(item, row) && isBlockedRow(row)
		)
	}
	if (queue === "ready_to_close") return isReadyToCloseRow(item, row, isTerminalReview)
	if (queue === "recently_closed") return row.queue === "resolved_history"
	if (queue === "needs_review" || queue === "all_open") {
		return !isTerminalReview && !isCleanFinancialRecord(item)
	}
	if (queue === "resolved_history") return row.queue === "resolved_history"
	if (queue === "refund_handoffs" || queue === "refund_handoff_required")
		return row.queue === "refund_handoffs"
	if (queue === "provider_finance" || queue === "provider_finance_review")
		return row.queue === "provider_finance"
	if (
		[
			"payable_blocked",
			"statement_stale",
			"reconciliation_blocked",
			"commission_missing",
			"reference_missing",
		].includes(queue)
	) {
		return row.queue === "provider_finance" && row.operationalState === queue
	}
	if (queue === "reconciliation_issues") return row.queue === "reconciliation_issues"
	if (queue === "evidence_issues") return row.queue === "evidence_issues"
	if (queue === "waiting_external") return isWaitingExternalRow(item, row)
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
