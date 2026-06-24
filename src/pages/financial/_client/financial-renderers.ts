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

function renderBookingProofLine(operation: any): string {
	const roomState = operation?.snapshotIntegrity?.hasRoomSnapshots
		? "alojamiento confirmado"
		: "falta confirmar alojamiento"
	const taxState = operation?.snapshotIntegrity?.hasTaxFeeSnapshots
		? "impuestos confirmados"
		: "faltan impuestos"
	return `${roomState} · ${taxState} · ${Number(operation?.snapshotIntegrity?.multiRoomAllocationCount || 0)} habitación(es)`
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
		? `<div class="mt-1 text-xs font-semibold text-amber-800">${deps.escapeHtml(financeView.title)} · Resumen: ${deps.escapeHtml(renderHumanFreshness(financeView.statementState))}</div>`
		: ""
	const inboxState = renderInboxState(row)
	const bookingContext = item.bookingId
		? `<a class="font-medium text-slate-950 hover:text-blue-700" href="/booking/${encodeURIComponent(String(item.bookingId || ""))}">${deps.escapeHtml(item.bookingId || "-")}</a>`
		: `<div class="font-medium text-slate-950">Sin reserva asociada</div>`
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
			<button type="button" data-review-key="${deps.escapeHtml(deps.itemKey(item))}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-500">Abrir caso</button>
		</td>
		<td class="px-3 py-3 text-slate-700">
			<div class="text-xs text-slate-500">${deps.escapeHtml(row.amountLabel)}</div>
			<div class="mt-1 text-sm font-semibold text-slate-950">${row.amount == null ? "No disponible" : deps.escapeHtml(deps.money(row.amountCurrency, row.amount))}</div>
			${bookingContext}
			<div class="mt-1 text-xs text-slate-500">${deps.escapeHtml(operation?.contract?.productName || "Alojamiento")} · ${deps.escapeHtml(operation?.contract?.variantName || "Asignación")}</div>
			<div class="mt-2 text-xs leading-5 text-slate-400">${deps.escapeHtml(renderBookingProofLine(operation))}</div>
		</td>`
}
