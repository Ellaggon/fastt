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
		row.blocker !== "No provider finance blocker is visible."
	) {
		return "Payable visibility blocked"
	}
	if (row.queue === "reconciliation_issues") return "Evidence review needed"
	if (row.queue === "evidence_issues") return "Evidence issue"
	if (row.queue === "waiting_external") return "Waiting external"
	return row.operationalState
}

function renderBasisLine(operation: any): string {
	const roomState = operation?.snapshotIntegrity?.hasRoomSnapshots
		? "room evidence visible"
		: "room evidence gap"
	const taxState = operation?.snapshotIntegrity?.hasTaxFeeSnapshots
		? "tax evidence visible"
		: "tax evidence gap"
	return `Contract evidence: ${roomState} · ${taxState} · ${Number(operation?.snapshotIntegrity?.multiRoomAllocationCount || 0)} room allocation(s)`
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
		? `<div class="mt-1 text-xs font-semibold text-amber-800">${deps.escapeHtml(deps.label(financeView.operationalState))} · Statement freshness: ${deps.escapeHtml(deps.label(financeView.statementState))}</div>`
		: ""
	return `
		<td class="px-3 py-3 text-slate-700 ${blockerClass}">
			<div class="flex items-start justify-between gap-2">
				<div class="font-medium ${item.code === "clean_record" ? "text-emerald-700" : "text-slate-950"}">${deps.escapeHtml(row.title)}</div>
				<span class="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">${deps.escapeHtml(deps.label(priority))}</span>
			</div>
			<div class="mt-1 max-w-xs text-xs leading-5 text-slate-500">${deps.escapeHtml(row.description)}</div>
			${providerFinanceLine}
			<div class="mt-2 flex flex-wrap gap-1">
				${deps.statusChip(item.status)}
				${handoff ? deps.handoffStatusChip(handoff.status) : ""}
				<span class="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">${deps.escapeHtml(row.sourceKind)}</span>
			</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			${
				item.bookingId
					? `<a class="font-medium text-slate-950 hover:text-blue-700" href="/booking/${encodeURIComponent(String(item.bookingId || ""))}">${deps.escapeHtml(item.bookingId || "-")}</a>`
					: `<div class="font-medium text-slate-950">Unmatched evidence</div>`
			}
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(operation?.contract?.productName || "Property")} · ${deps.escapeHtml(operation?.contract?.variantName || "Allocation")}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(deps.money(operation.currency, operation.contractTotal))} · ${deps.escapeHtml(operation?.contract?.version || "snapshot")}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="flex flex-wrap gap-1">${ownerMarkup}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div>${deps.escapeHtml(deps.label(operation?.transactions?.financialEvidence?.paymentIntentShadow || row.staleState || "not_visible"))}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(row.evidenceSummary)}</div>
			<div class="mt-1 text-xs text-slate-500">reference recorded / evidence visible</div>
			</td>
			<td class="px-3 py-3 text-slate-700">
				<div class="max-w-xs text-sm font-semibold text-slate-900">${deps.escapeHtml(row.blocker)}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(renderBasisLine(operation))}</div>
		</td>
		<td class="px-3 py-3 text-right">
			<div class="mb-2 max-w-48 text-right text-xs font-semibold leading-5 text-slate-700">${deps.escapeHtml(row.nextAction)}</div>
			<button type="button" data-review-key="${deps.escapeHtml(deps.itemKey(item))}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Open review</button>
		</td>`
}
