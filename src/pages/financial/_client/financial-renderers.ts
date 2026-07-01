import type { FinancialRowViewModel } from "./financial-row-view-model"
import { buildProviderFinanceRowViewModel } from "./financial-provider-finance-view-model"
import {
	bookingDisplayName,
	bookingSubtitle,
	providerDisplayName,
	statePillClass,
} from "./financial-human-display"

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
	if (row.attentionState === "waiting_external") return "Esperando respuesta"
	if (row.attentionState === "ready_to_close") return "Listo para cerrar"
	if (row.attentionState === "closed") return "Cerrado"
	if (row.isBlocked && row.operationalCategory === "provider_payables")
		return "Pago pendiente bloqueado"
	if (row.isBlocked && row.operationalCategory === "settlements") return "Importes por revisar"
	if (row.isBlocked && row.operationalCategory === "collections") return "Comprobante requerido"
	if (row.isBlocked && row.operationalCategory === "refunds") return "Reembolso bloqueado"
	return "Requiere atención"
}

function renderInboxState(row: FinancialRowViewModel): string {
	const labels = {
		needs_attention: "Requiere atención",
		waiting_external: "Esperando respuesta",
		blocked: "Bloqueado",
		ready_to_close: "Listo para cerrar",
		closed: "Cerrado",
	}
	return labels[row.attentionState]
}

function renderHumanFreshness(value: unknown): string {
	const state = String(value || "").toLowerCase()
	if (state === "fresh") return "Información actualizada"
	if (state === "stale") return "La información cambió; revisar otra vez"
	if (state === "waiting_external") return "Esperando respuesta"
	if (state === "not_visible") return "Todavía no disponible"
	if (state === "unknown") return "Por confirmar"
	if (state === "snapshot_ready" || state === "evidence_matched") return "Información suficiente"
	if (state === "evidence_partial") return "Faltan comprobantes"
	if (state === "evidence_unknown") return "Comprobantes por confirmar"
	if (state === "handoff_pending") return "Esperando seguimiento"
	if (state === "evidence_visible" || state === "visible") return "Comprobante disponible"
	return "Por confirmar"
}

export function renderFinancialRowHtml(params: {
	item: any
	row: FinancialRowViewModel
	operation: any
	handoff: any
	ownerMarkup: string
	deps: RowRenderDeps
}): string {
	const { item, row, operation, ownerMarkup, deps } = params
	const priority = renderPriorityBadge(row)
	const blockerClass =
		row.queue === "provider_finance" || row.queue === "reconciliation_issues"
			? "border-l-4 border-l-amber-400 bg-amber-50/40"
			: ""
	const financeView = item.providerFinance
		? buildProviderFinanceRowViewModel(item.providerFinance)
		: null
	const providerFinanceLine = financeView
		? `<div class="mt-1 text-xs font-semibold text-amber-800">${deps.escapeHtml(financeView.title)} · Resumen: ${deps.escapeHtml(renderHumanFreshness(financeView.statementState))}</div>`
		: ""
	const inboxState = renderInboxState(row)
	const bookingLabel = bookingDisplayName(item.bookingId, { operation, ...item })
	const bookingContext = item.bookingId
		? `<a class="font-semibold text-slate-950 hover:text-blue-700" href="/booking/${encodeURIComponent(String(item.bookingId || ""))}">${deps.escapeHtml(bookingLabel)}</a>`
		: `<div class="font-semibold text-slate-950">Sin reserva asociada</div>`
	const subtitle = bookingSubtitle({ operation, ...item })
	const providerLabel = providerDisplayName(item.providerId, { operation, ...item })
	const pillKind =
		row.attentionState === "waiting_external"
			? "waiting"
			: row.attentionState === "ready_to_close"
				? "ready"
				: row.attentionState === "closed"
					? "closed"
					: row.isBlocked
						? "blocked"
						: "neutral"
	return `
		<td class="px-3 py-4 text-slate-700 ${blockerClass}">
			<div class="flex items-start justify-between gap-3">
				<div>
					<div class="font-semibold ${item.code === "clean_record" ? "text-emerald-700" : "text-slate-950"}">${deps.escapeHtml(row.title)}</div>
					<div class="mt-1 text-xs font-medium text-slate-600">${bookingContext}</div>
					<div class="mt-1 max-w-md text-xs leading-5 text-slate-500">${deps.escapeHtml(subtitle)} · ${deps.escapeHtml(providerLabel)}</div>
				</div>
				<span class="shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statePillClass(pillKind)}">${deps.escapeHtml(inboxState)}</span>
			</div>
			<div class="mt-2 max-w-xl text-xs leading-5 text-slate-600">${deps.escapeHtml(row.description)}</div>
			${providerFinanceLine}
		</td>
		<td class="px-3 py-4 text-slate-700">
			<div class="text-xs text-slate-500">${deps.escapeHtml(row.amountLabel)}</div>
			<div class="mt-1 text-base font-semibold text-slate-950">${row.amount == null ? "No disponible" : deps.escapeHtml(deps.money(row.amountCurrency, row.amount))}</div>
			<div class="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">${deps.escapeHtml(deps.label(priority))}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="max-w-xs text-sm font-semibold text-slate-950">${deps.escapeHtml(row.blocker)}</div>
			<div class="mt-2 text-xs leading-5 text-slate-500">${deps.escapeHtml(row.evidenceSummary)}</div>
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(renderHumanFreshness(operation?.transactions?.financialEvidence?.paymentEvidence || row.staleState || "not_visible"))}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="flex flex-wrap gap-1">${ownerMarkup}</div>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="text-sm font-semibold text-slate-900">${deps.escapeHtml(row.ageLabel)}</div>
		</td>
		<td class="px-3 py-3">
			<div class="mb-2 max-w-56 text-xs font-semibold leading-5 text-slate-800">${deps.escapeHtml(row.nextAction)}</div>
			<button type="button" data-review-key="${deps.escapeHtml(deps.itemKey(item))}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Abrir caso</button>
		</td>`
}
