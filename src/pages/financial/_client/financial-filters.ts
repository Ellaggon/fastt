import type { FinancialActorFilter } from "./financial-actor-filters"
import { actorMatchesRow } from "./financial-actor-filters"
import type { FinancialRowViewModel } from "./financial-row-view-model"

export type FinancialWorkspaceFilterState = {
	segment: string
	workType: string
	search: string
	lodging: string
	age: string
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

function isWaitingExternalRow(row: FinancialRowViewModel): boolean {
	return row.attentionState === "waiting_external"
}

function isClosedRow(row: FinancialRowViewModel, isTerminalReview: boolean): boolean {
	return isTerminalReview || row.attentionState === "closed"
}

function isBlockedRow(row: FinancialRowViewModel): boolean {
	return row.isBlocked
}

function isReadyToCloseRow(row: FinancialRowViewModel, isTerminalReview: boolean): boolean {
	return !isClosedRow(row, isTerminalReview) && row.canClose
}

export function queueMatchesRow(params: {
	item: any
	row: FinancialRowViewModel
	queue: string
	isTerminalReview: boolean
}): boolean {
	const { item, row, queue, isTerminalReview } = params
	if (queue === "advanced_all" || queue === "all") return true
	if (
		["collections", "provider_payables", "refunds", "settlements", "exceptions"].includes(queue)
	) {
		return row.operationalCategory === queue
	}
	if (queue === "needs_action_today") {
		return (
			!isClosedRow(row, isTerminalReview) &&
			!isCleanFinancialRecord(item) &&
			!isWaitingExternalRow(row)
		)
	}
	if (queue === "blocked") {
		return !isClosedRow(row, isTerminalReview) && !isWaitingExternalRow(row) && isBlockedRow(row)
	}
	if (queue === "ready_to_close") return isReadyToCloseRow(row, isTerminalReview)
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
	if (queue === "waiting_external") return isWaitingExternalRow(row)
	if (queue === "clean_records") return isCleanFinancialRecord(item)
	if (queue === "missing_references") {
		return hasAnyCode(item, [
			"missing_payment_reference",
			"missing_settlement_reference",
			"missing_refund_reference",
		])
	}
	if (queue === "snapshot_gaps") {
		return hasAnyCode(item, ["incomplete_contract_snapshot"])
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
		const searchMatches = textMatches(item, filters.search)
		const lodgingMatches = lodgingTextMatches(item, filters.lodging)
		const ageMatches = ageFilterMatches(row, filters.age)
		return (
			searchMatches &&
			lodgingMatches &&
			ageMatches &&
			queueMatchesRow({
				item,
				row,
				queue: filters.segment,
				isTerminalReview: isTerminalReview(item),
			}) &&
			workTypeMatchesRow(row, filters.workType) &&
			actorMatchesRow(filters.actor, row)
		)
	})
}

function normalize(value: unknown): string {
	return String(value ?? "")
		.toLowerCase()
		.trim()
}

function searchableValues(item: any): string[] {
	return [
		item?.bookingId,
		item?.providerId,
		item?.providerFinance?.providerId,
		item?.providerFinance?.bookingId,
		item?.operation?.bookingId,
		item?.operation?.contract?.productName,
		item?.operation?.contract?.variantName,
		item?.operation?.contract?.ratePlanName,
		...(Array.isArray(item?.operation?.references)
			? item.operation.references.map((row: any) => row?.referenceValue)
			: []),
		...(Array.isArray(item?.references)
			? item.references.map((row: any) => row?.referenceValue)
			: []),
		...(Array.isArray(item?.payment?.transactions)
			? item.payment.transactions.map((row: any) => row?.externalReference)
			: []),
		...(Array.isArray(item?.settlement?.records)
			? item.settlement.records.map((row: any) => row?.settlementReference)
			: []),
	]
		.map((value) => String(value ?? ""))
		.filter(Boolean)
}

function textMatches(item: any, query: string): boolean {
	const normalized = normalize(query)
	if (!normalized) return true
	return searchableValues(item).some((value) => normalize(value).includes(normalized))
}

function lodgingTextMatches(item: any, query: string): boolean {
	const normalized = normalize(query)
	if (!normalized) return true
	const values = [
		item?.operation?.contract?.productName,
		item?.operation?.contract?.variantName,
		item?.operation?.contract?.ratePlanName,
		item?.contract?.productName,
		item?.contract?.variantName,
	]
	return values.some((value) => normalize(value).includes(normalized))
}

function ageFilterMatches(row: FinancialRowViewModel, age: string): boolean {
	if (!age || age === "all") return true
	const days = Number.parseInt(String(row.ageLabel || "").match(/\d+/)?.[0] || "0", 10)
	if (age === "today") return days === 0
	if (age === "over_3") return days >= 3
	if (age === "over_7") return days >= 7
	if (age === "over_14") return days >= 14
	return true
}

function workTypeMatchesRow(row: FinancialRowViewModel, workType: string): boolean {
	if (!workType || workType === "all") return true
	return row.operationalCategory === workType
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
