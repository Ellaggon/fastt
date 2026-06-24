import {
	handoffStatusLabels,
	overlaySourceLabels,
	ownerLabels,
	statusLabels,
} from "./financial-labels"
import type { FinancialWorkspaceState } from "./financial-workspace-state"
import { buildFinancialRowViewModel } from "./financial-row-view-model"

export const reviewTerminalStatuses = new Set(["resolved", "dismissed"])
export const refundHandoffTerminalStatuses = new Set(["closed", "dismissed"])

export const money = (currency: unknown, value: unknown): string =>
	`${String(currency || "USD")} ${Number(value || 0).toFixed(2)}`

export const label = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.replaceAll("_", " ") || "-"

export const labelFrom = (map: Record<string, string>, value: unknown, fallback = "-"): string => {
	const key = String(value ?? "").trim()
	return map[key] || label(key || fallback)
}

export const escapeHtml = (value: unknown): string =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;")

export function ageDays(value: unknown): number | null {
	if (!value) return null
	const date = new Date(String(value))
	if (Number.isNaN(date.getTime())) return null
	return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

export function formatDate(value: unknown): string {
	if (!value) return "-"
	const date = new Date(String(value))
	if (Number.isNaN(date.getTime())) return "-"
	return date.toISOString().slice(0, 10)
}

export const statusLabel = (status: unknown): string => labelFrom(statusLabels, status || "open")
export const ownerLabel = (owner: unknown): string => labelFrom(ownerLabels, owner || "none")
export const handoffStatusLabel = (status: unknown): string =>
	labelFrom(handoffStatusLabels, status || "required")

export function exceptionCodes(item: any): string[] {
	return Array.isArray(item?.operation?.operationalException?.all)
		? item.operation.operationalException.all.map((entry: any) => String(entry?.code || ""))
		: []
}

export function hasAnyCode(item: any, codes: string[]): boolean {
	return String(item?.code || "")
		? codes.includes(String(item.code))
		: exceptionCodes(item).some((code) => codes.includes(code))
}

export function itemKey(item: any): string {
	return String(item?.id || `${item?.bookingId || ""}::${item?.code || "clean_record"}`)
}

export function sourceLabel(item: any): string {
	const source = String(item?.overlaySource || "")
	return overlaySourceLabels[source] || (item?.workflow ? "persisted" : "visibility only")
}

export function handoffTerminal(handoff: any): boolean {
	return refundHandoffTerminalStatuses.has(String(handoff?.status || ""))
}

export function isTerminalReview(item: any): boolean {
	return reviewTerminalStatuses.has(String(item?.status || "open"))
}

export function operationalAge(item: any): string {
	const opened = item?.openedAt || item?.workflow?.openedAt
	const openedAge = ageDays(opened)
	if (openedAge != null)
		return `${statusLabel(item?.status)} · ${openedAge} ${openedAge === 1 ? "día" : "días"}`
	const confirmedAge = ageDays(item?.operation?.confirmedAt)
	if (confirmedAge != null)
		return `reserva confirmada hace ${confirmedAge} ${confirmedAge === 1 ? "día" : "días"}`
	return "antigüedad no disponible"
}

export function refundHandoffsFor(state: FinancialWorkspaceState, item: any): any[] {
	return state.persistedRefundHandoffs.filter((handoff) => handoff.bookingId === item.bookingId)
}

export function refundHandoffFor(state: FinancialWorkspaceState, item: any): any | null {
	const handoffs = refundHandoffsFor(state, item)
	return handoffs.find((handoff) => !handoffTerminal(handoff)) || handoffs[0] || null
}

export function refundHandoffAge(handoff: any): string {
	const openedAge = ageDays(handoff?.openedAt)
	if (openedAge == null) return "antigüedad no disponible"
	return `${handoffStatusLabel(handoff.status)} · ${openedAge} ${openedAge === 1 ? "día" : "días"}`
}

export function refundHandoffDerivedSuppressed(state: FinancialWorkspaceState, item: any): boolean {
	const handoff = refundHandoffFor(state, item)
	return (
		String(item?.code || "") === "refund_handoff_required" && handoff && handoffTerminal(handoff)
	)
}

export function reconciliationFor(state: FinancialWorkspaceState, item: any): any | null {
	return state.reconciliationItems.find((entry) => entry.bookingId === item.bookingId) || null
}

export function eventsFor(state: FinancialWorkspaceState, item: any): any[] {
	return state.reviewEvents.filter((event) => {
		if (item.persistedId && event.financialExceptionId === item.persistedId) return true
		return event.bookingId === item.bookingId
	})
}

export function referencesFor(state: FinancialWorkspaceState, item: any): any[] {
	return state.persistedReferences.filter((reference) => reference.bookingId === item.bookingId)
}

export function shadowEvidenceEntries(item: any): any[] {
	const refs = item?.operation?.transactions?.references || {}
	return [
		...(refs.payment || []).map((value: unknown) => ({
			type: "payment_evidence",
			referenceValue: value,
			source: "shadow visibility",
		})),
		...(refs.settlement || []).map((value: unknown) => ({
			type: "settlement_evidence",
			referenceValue: value,
			source: "shadow visibility",
		})),
		...(refs.refund || []).map((value: unknown) => ({
			type: "refund_evidence",
			referenceValue: value,
			source: "shadow visibility",
		})),
	]
}

export function evidenceEntriesFor(state: FinancialWorkspaceState, item: any): any[] {
	return [
		...referencesFor(state, item).map((reference) => ({ ...reference, isPersisted: true })),
		...shadowEvidenceEntries(item).map((reference) => ({ ...reference, isPersisted: false })),
	]
}

export function referenceCounts(state: FinancialWorkspaceState, item: any): Record<string, number> {
	const entries = [...referencesFor(state, item), ...shadowEvidenceEntries(item)]
	return {
		payment: entries.filter((entry) => entry.type === "payment_evidence").length,
		settlement: entries.filter((entry) => entry.type === "settlement_evidence").length,
		refund: entries.filter((entry) => entry.type === "refund_evidence").length,
		invoice: entries.filter((entry) => entry.type === "invoice_reference").length,
	}
}

export function rowViewFor(state: FinancialWorkspaceState, item: any) {
	return buildFinancialRowViewModel({
		item,
		reconciliation: reconciliationFor(state, item),
		refundHandoff: refundHandoffFor(state, item),
		referenceCounts: referenceCounts(state, item),
		ageLabel: operationalAge(item),
		sourceKind: sourceLabel(item),
	})
}
