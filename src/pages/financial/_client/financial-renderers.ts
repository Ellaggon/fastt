import type { FinancialRowViewModel } from "./financial-row-view-model"
import { buildProviderFinanceRowViewModel } from "./financial-provider-finance-view-model"

type RowRenderDeps = {
	escapeHtml: (value: unknown) => string
	money: (currency: unknown, value: unknown) => string
	label: (value: unknown) => string
	statusChip: (status: unknown) => string
	handoffStatusChip: (status: unknown) => string
	ownerChip: (owner: unknown) => string
	itemKey: (item: any) => string
}

export function renderPriorityBadge(row: FinancialRowViewModel): string {
	if (
		row.queue === "provider_finance" &&
		![
			"No provider finance blocker is visible.",
			"Nothing is stopping the provider payable check.",
		].includes(row.blocker)
	) {
		return "Provider payable check is stuck"
	}
	if (row.queue === "reconciliation_issues") return "Proof does not line up"
	if (row.queue === "evidence_issues") return "Proof needs attention"
	if (row.queue === "waiting_external") return "Waiting on someone else"
	return row.operationalState
}

function renderBookingProofLine(operation: any): string {
	const roomState = operation?.snapshotIntegrity?.hasRoomSnapshots
		? "room proof visible"
		: "room proof missing"
	const taxState = operation?.snapshotIntegrity?.hasTaxFeeSnapshots
		? "tax proof visible"
		: "tax proof missing"
	return `Booking proof: ${roomState} · ${taxState} · ${Number(operation?.snapshotIntegrity?.multiRoomAllocationCount || 0)} room allocation(s)`
}

function renderInboxState(row: FinancialRowViewModel, item: any): string {
	if (row.queue === "waiting_external" || String(item?.status || "") === "waiting_external") {
		return "Waiting on someone else"
	}
	if (row.queue === "resolved_history") return "Closed recently"
	if (row.queue === "provider_finance" && row.operationalState !== "provider_finance_review") {
		return "Stuck"
	}
	if (["reconciliation_issues", "evidence_issues", "refund_handoffs"].includes(row.queue)) {
		return "Needs attention"
	}
	if (String(item?.status || "") === "acknowledged") return "Can be closed"
	if (row.nextAction.toLowerCase().includes("resolve")) return "Can be closed"
	return "Needs attention"
}

function renderHumanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Up to date"
	if (state === "stale") return "Needs another look"
	if (state === "waiting_external") return "Waiting on someone else"
	if (state === "not_visible") return "Not visible yet"
	if (state === "unknown") return "Unclear"
	return state ? state.replaceAll("_", " ") : "Unclear"
}

export function renderFinancialRowHtml(params: {
	item: any
	row: FinancialRowViewModel
	operation: any
	handoff: any
	ownerMarkup: string
	deps: RowRenderDeps
}): string {
	const { item, row, operation, handoff, ownerMarkup, deps } = params
	const priority = renderPriorityBadge(row)
	const blockerClass =
		row.queue === "provider_finance" || row.queue === "reconciliation_issues"
			? "border-l-4 border-l-amber-400 bg-amber-50/40"
			: ""
	const financeView = item.providerFinance
		? buildProviderFinanceRowViewModel(item.providerFinance)
		: null
	const providerFinanceLine = financeView
		? `<div class="mt-1 text-xs font-semibold text-amber-800">${deps.escapeHtml(financeView.title)} · Statement draft: ${deps.escapeHtml(renderHumanFreshness(financeView.statementState))}</div>`
		: ""
	const inboxState = renderInboxState(row, item)
	const bookingContext = item.bookingId
		? `<a class="font-medium text-slate-950 hover:text-blue-700" href="/booking/${encodeURIComponent(String(item.bookingId || ""))}">${deps.escapeHtml(item.bookingId || "-")}</a>`
		: `<div class="font-medium text-slate-950">Unmatched evidence</div>`
	return `
		<td class="px-3 py-3 text-slate-700 ${blockerClass}">
			<div class="flex items-start justify-between gap-2">
				<div class="font-medium ${item.code === "clean_record" ? "text-emerald-700" : "text-slate-950"}">${deps.escapeHtml(row.title)}</div>
				<span class="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">${deps.escapeHtml(inboxState)}</span>
			</div>
			<div class="mt-1 max-w-xs text-xs leading-5 text-slate-500">${deps.escapeHtml(row.description)}</div>
			${providerFinanceLine}
			<div class="mt-2 flex flex-wrap gap-1 text-xs">
				<span class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">${deps.escapeHtml(deps.label(priority))}</span>
				${deps.statusChip(item.status)}
				${handoff ? deps.handoffStatusChip(handoff.status) : ""}
			</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="max-w-xs text-sm font-semibold text-slate-950">${deps.escapeHtml(row.blocker)}</div>
			<div class="mt-2 text-xs leading-5 text-slate-500">${deps.escapeHtml(row.evidenceSummary)}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(renderHumanFreshness(operation?.transactions?.financialEvidence?.paymentEvidence || row.staleState || "not_visible"))}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="flex flex-wrap gap-1">${ownerMarkup}</div>
		</td>
		<td class="px-3 py-3">
			<div class="mb-2 max-w-56 text-xs font-semibold leading-5 text-slate-800">${deps.escapeHtml(row.nextAction)}</div>
			<button type="button" data-review-key="${deps.escapeHtml(deps.itemKey(item))}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Open case</button>
		</td>
		<td class="px-3 py-3 text-slate-700">
			${bookingContext}
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(operation?.contract?.productName || "Property")} · ${deps.escapeHtml(operation?.contract?.variantName || "Allocation")}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(deps.money(operation.currency, operation.contractTotal))}</div>
			<div class="mt-2 text-xs leading-5 text-slate-400">${deps.escapeHtml(renderBookingProofLine(operation))}</div>
			<div class="mt-1 text-xs text-slate-400">${deps.escapeHtml(row.sourceKind)}</div>
		</td>`
}
