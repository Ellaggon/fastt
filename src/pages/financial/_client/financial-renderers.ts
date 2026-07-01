import type { FinancialRowViewModel } from "./financial-row-view-model"
import { buildProviderFinanceRowViewModel } from "./financial-provider-finance-view-model"
import {
	bookingDisplayName,
	bookingSubtitle,
	providerDisplayName,
	stateDotClass,
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
	const stateKind: "blocked" | "waiting" | "ready" | "closed" | "neutral" =
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
		<article class="group cursor-pointer px-4 py-4 transition hover:bg-slate-50 ${blockerClass}" data-review-key="${deps.escapeHtml(deps.itemKey(item))}">
			<div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(150px,0.55fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
				<div>
					<div class="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
						<span class="h-2.5 w-2.5 rounded-full ${stateDotClass(stateKind)}" aria-hidden="true"></span>
						<span>${deps.escapeHtml(inboxState)}</span>
						<span class="text-slate-300">/</span>
						<span>${deps.escapeHtml(deps.label(priority))}</span>
					</div>
					<h3 class="mt-2 text-base font-semibold ${item.code === "clean_record" ? "text-emerald-700" : "text-slate-950"}">${deps.escapeHtml(row.title)}</h3>
					<div class="mt-1 text-sm font-medium text-slate-700">${bookingContext}</div>
					<p class="mt-1 max-w-2xl text-xs leading-5 text-slate-500">${deps.escapeHtml(subtitle)} · ${deps.escapeHtml(providerLabel)}</p>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-slate-700">${deps.escapeHtml(row.description)}</p>
					${providerFinanceLine}
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">${deps.escapeHtml(row.amountLabel)}</p>
					<p class="mt-1 text-lg font-bold text-slate-950">${row.amount == null ? "No disponible" : deps.escapeHtml(deps.money(row.amountCurrency, row.amount))}</p>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Qué impide avanzar</p>
					<p class="mt-1 text-sm font-semibold leading-6 text-slate-950">${deps.escapeHtml(row.blocker)}</p>
					<p class="mt-1 text-xs leading-5 text-slate-500">${deps.escapeHtml(row.evidenceSummary)}</p>
					<p class="mt-1 text-xs text-slate-500">${deps.escapeHtml(renderHumanFreshness(operation?.transactions?.financialEvidence?.paymentEvidence || row.staleState || "not_visible"))}</p>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Próxima acción</p>
					<p class="mt-1 text-sm font-semibold leading-6 text-slate-900">${deps.escapeHtml(row.nextAction)}</p>
					<div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
						<span>Responsable:</span>
						${ownerMarkup}
						<span class="text-slate-300">·</span>
						<span>${deps.escapeHtml(row.ageLabel)}</span>
					</div>
					<button type="button" class="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition group-hover:border-slate-500">Abrir caso</button>
				</div>
			</div>
		</article>`
}
