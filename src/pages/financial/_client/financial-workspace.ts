import {
	submitFinancialReference,
	submitFinancialReviewAction,
	submitReconciliationReviewMarker,
	submitRefundHandoffReview,
} from "./financial-actions"
import { actorNoiseHint } from "./financial-actor-filters"
import { countFinancialQueue, filterFinancialRows } from "./financial-filters"
import { primarySummaryQueues } from "./financial-queues"
import { renderFinancialRowHtml } from "./financial-renderers"
import {
	createFinancialWorkspaceState,
	resetFinancialWorkspaceState,
} from "./financial-workspace-state"
import {
	closeFinancialDrawer,
	openFinancialDrawer,
	selectedItemStillVisible,
} from "./financial-workspace-events"
import { mergeFinancialWorkspaceItems } from "./financial-workspace-orchestrator"
import {
	escapeHtml,
	handoffStatusLabel,
	handoffTerminal,
	hasAnyCode,
	isTerminalReview,
	itemKey,
	label,
	money,
	operationalAge,
	ownerLabel,
	refundHandoffAge,
	refundHandoffDerivedSuppressed,
	refundHandoffFor,
	rowViewFor,
	statusLabel,
} from "./financial-workspace-selectors"
;(function () {
	const workspaceState = createFinancialWorkspaceState()
	const actorFilter = document.getElementById("financialActorFilter") as HTMLSelectElement | null
	const queueFilter = document.getElementById("financialQueueFilter") as HTMLSelectElement | null
	const stateFilter = document.getElementById("financialStateFilter") as HTMLSelectElement | null
	const summary = document.getElementById("financialSummary")
	const rows = document.getElementById("financialRows")
	const listSummary = document.getElementById("financialListSummary")
	const drawer = document.getElementById("financialReviewDrawer")
	const drawerBackdrop = document.getElementById("financialReviewBackdrop")
	const drawerBody = document.getElementById("financialReviewDrawerBody")
	const drawerClose = document.getElementById("financialReviewDrawerClose")

	const statusClass = (status: unknown): string => {
		const map: Record<string, string> = {
			open: "border-amber-200 bg-amber-50 text-amber-800",
			acknowledged: "border-blue-200 bg-blue-50 text-blue-800",
			waiting_external: "border-sky-200 bg-sky-50 text-sky-800",
			resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
			dismissed: "border-slate-200 bg-slate-50 text-slate-600",
		}
		return map[String(status || "open")] || "border-slate-200 bg-white text-slate-700"
	}
	const statusChip = (status: unknown): string =>
		`<span class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>`
	const ownerChip = (owner: unknown): string =>
		`<span class="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">${escapeHtml(ownerLabel(owner))}</span>`
	const handoffStatusClass = (status: unknown): string => {
		const map: Record<string, string> = {
			required: "border-amber-200 bg-amber-50 text-amber-800",
			acknowledged: "border-blue-200 bg-blue-50 text-blue-800",
			waiting_external: "border-sky-200 bg-sky-50 text-sky-800",
			evidence_recorded: "border-emerald-200 bg-emerald-50 text-emerald-800",
			closed: "border-slate-200 bg-slate-50 text-slate-700",
			dismissed: "border-slate-200 bg-slate-50 text-slate-600",
		}
		return map[String(status || "required")] || "border-slate-200 bg-white text-slate-700"
	}
	const handoffStatusChip = (status: unknown): string =>
		`<span class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${handoffStatusClass(status)}">${escapeHtml(handoffStatusLabel(status))}</span>`
	const fieldValue = (id: string): string =>
		String(
			(document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value || ""
		)

	const rowFor = (item: any) => rowViewFor(workspaceState, item)
	const refundFor = (item: any) => refundHandoffFor(workspaceState, item)

	function currentFilters() {
		return {
			actor: String(actorFilter?.value || "all") as any,
			queue: String(queueFilter?.value || "needs_action_today"),
			evidenceState: String(stateFilter?.value || "all"),
		}
	}

	function applyFilters(items: any[]): any[] {
		return filterFinancialRows({
			items,
			filters: currentFilters(),
			rowFor,
			isTerminalReview,
			isSuppressed: (item) => refundHandoffDerivedSuppressed(workspaceState, item),
		})
	}

	function countQueue(items: any[], queue: string): number {
		return countFinancialQueue({ items, queue, rowFor, isTerminalReview })
	}

	function renderSummary(items: any[]): void {
		if (!summary) return
		const metrics = primarySummaryQueues.map((metric) => ({
			...metric,
			value: countQueue(items, metric.queue),
		}))
		summary.innerHTML = metrics
			.map(
				(
					metric
				) => `<button type="button" data-queue="${metric.queue}" class="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-white">
					<span class="text-slate-950">${metric.value}</span>
					<span class="ml-1">${metric.label}</span>
				</button>`
			)
			.join("")
		summary.querySelectorAll("[data-queue]").forEach((button) => {
			button.addEventListener("click", () => {
				if (queueFilter) {
					queueFilter.value = String(button.getAttribute("data-queue") || "needs_action_today")
				}
				renderFinancialView()
			})
		})
	}

	function renderRows(items: any[]): void {
		if (!rows) return
		rows.innerHTML = ""
		if (!Array.isArray(items) || !items.length) {
			rows.innerHTML =
				'<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">No hay casos en esta vista. Revisa los casos en espera, cerrados o todos los casos si necesitas más contexto.</td></tr>'
			return
		}
		for (const item of items) {
			const operation = item.operation || {}
			const tr = document.createElement("tr")
			tr.className = "border-t border-slate-200 align-top hover:bg-white"
			const rowView = rowFor(item)
			const handoff = refundFor(item)
			const ownerMarkup =
				handoff && hasAnyCode(item, ["refund_handoff_required"])
					? `${ownerChip(handoff.nextOwner)}<div class="mt-2 text-xs text-slate-500">${escapeHtml(refundHandoffAge(handoff))}</div>`
					: `${ownerChip(rowView.owner)}<div class="mt-2 text-xs text-slate-500">${escapeHtml(rowView.ageLabel)}</div>`
			tr.innerHTML = renderFinancialRowHtml({
				item,
				row: rowView,
				operation,
				handoff,
				ownerMarkup,
				deps: {
					escapeHtml,
					money,
					label,
					statusChip,
					handoffStatusChip,
					ownerChip,
					itemKey,
				},
			})
			rows.appendChild(tr)
		}
		rows.querySelectorAll("[data-review-key]").forEach((button) => {
			button.addEventListener("click", () => {
				const key = String(button.getAttribute("data-review-key") || "")
				const item = workspaceState.combinedItems.find((entry) => itemKey(entry) === key)
				if (item) openDrawer(item)
			})
		})
	}

	function openDrawer(item: any): void {
		const handoff = refundFor(item)
		openFinancialDrawer({
			state: workspaceState,
			item,
			drawer,
			drawerBackdrop,
			drawerBody,
			canReview: Boolean(item.persistedId) && !isTerminalReview(item),
			canReviewHandoff: Boolean(handoff) && !handoffTerminal(handoff),
			duplicateExternalReferences: workspaceState.duplicateExternalReferences,
			deps: {
				escapeHtml,
				money,
				label,
				statusChip,
				ownerChip,
				handoffStatusChip,
				handoffStatusLabel,
				operationalAge,
			},
			handlers: {
				onReviewAction: (action) => void submitReviewAction(action),
				onReferenceAction: () => void submitReference(),
				onRefundHandoffAction: (action) => void submitRefundHandoffAction(action),
				onReconciliationAction: () => void submitReconciliationReview(),
			},
		})
	}

	function closeDrawer(): void {
		closeFinancialDrawer({ state: workspaceState, drawer, drawerBackdrop })
	}

	async function reopenSelectedOrClose(): Promise<void> {
		const refreshed = selectedItemStillVisible(workspaceState)
		if (refreshed) openDrawer(refreshed)
		else closeDrawer()
	}

	async function submitReviewAction(action: string): Promise<void> {
		const selectedItem = workspaceState.selectedItem
		if (!selectedItem?.persistedId) return
		const note = fieldValue("financialResolutionNote").trim()
		if (action !== "acknowledge" && !note) {
			alert("La nota de cierre es obligatoria.")
			return
		}
		const response = await submitFinancialReviewAction({
			persistedId: selectedItem.persistedId,
			action: action as any,
			resolutionNote: note,
		})
		if (!response.ok) {
			alert("No se pudo guardar la acción de revisión.")
			return
		}
		await fetchWorkspace()
		await reopenSelectedOrClose()
	}

	async function submitReference(): Promise<void> {
		const selectedItem = workspaceState.selectedItem
		if (!selectedItem?.bookingId) return
		const type = fieldValue("financialReferenceType").trim()
		const referenceValue = fieldValue("financialReferenceValue").trim()
		const externalSystem = fieldValue("financialReferenceSystem").trim() || null
		const amountInput = fieldValue("financialReferenceAmount").trim()
		const currency = fieldValue("financialReferenceCurrency").trim().toUpperCase() || null
		const note = fieldValue("financialReferenceNote").trim()
		if (!referenceValue) {
			alert("La referencia externa es obligatoria.")
			return
		}
		const amount = amountInput ? Number(amountInput) : null
		if (amountInput && !Number.isFinite(amount)) {
			alert("El importe debe ser numérico.")
			return
		}
		const response = await submitFinancialReference({
			bookingId: selectedItem.bookingId,
			type,
			referenceValue,
			externalSystem,
			amount,
			currency,
			note,
			linkedExceptionId: selectedItem.persistedId || null,
		})
		if (!response.ok) {
			alert("No se pudo registrar la referencia.")
			return
		}
		alert("Referencia registrada. El comprobante ya está disponible para revisión.")
		await fetchWorkspace()
		await reopenSelectedOrClose()
	}

	async function submitRefundHandoffAction(action: string): Promise<void> {
		const handoff = refundFor(workspaceState.selectedItem)
		if (!handoff?.id) return
		const note = fieldValue("refundHandoffNote").trim()
		if (action !== "acknowledge" && !note) {
			alert("La nota de seguimiento del reembolso es obligatoria.")
			return
		}
		const response = await submitRefundHandoffReview({
			handoffId: handoff.id,
			action: action as any,
			resolutionNote: note,
		})
		if (!response.ok) {
			alert("No se pudo guardar la revisión del reembolso.")
			return
		}
		await fetchWorkspace()
		await reopenSelectedOrClose()
	}

	async function submitReconciliationReview(): Promise<void> {
		const selectedItem = workspaceState.selectedItem
		if (!selectedItem?.bookingId) return
		const reviewNote = fieldValue("reconciliationReviewNote").trim()
		const response = await submitReconciliationReviewMarker({
			bookingId: selectedItem.bookingId,
			reviewNote: reviewNote || null,
		})
		if (!response.ok) {
			alert("No se pudo guardar la revisión de los importes.")
			return
		}
		await fetchWorkspace()
		await reopenSelectedOrClose()
	}

	function renderFinancialView(): void {
		mergeFinancialWorkspaceItems(workspaceState)
		const filteredItems = applyFilters(workspaceState.combinedItems)
		renderSummary(workspaceState.combinedItems)
		renderRows(filteredItems)
		if (listSummary) {
			const openCount = countQueue(workspaceState.combinedItems, "needs_action_today")
			const shownCount = filteredItems.length
			const actor = String(actorFilter?.value || "all") as any
			listSummary.textContent = `${openCount} caso(s) requieren atención. Mostrando ${shownCount}. ${actorNoiseHint(actor)}`
		}
	}

	async function readWorkspaceJson(response: Response, fallback: any): Promise<any> {
		if (response.ok) return response.json()
		if (response.status === 404) return fallback
		throw new Error("financial_workspace_load_failed")
	}

	async function fetchWorkspace(): Promise<void> {
		const [
			operationsResponse,
			exceptionsResponse,
			eventsResponse,
			referencesResponse,
			handoffsResponse,
			reconciliationResponse,
			providerFinanceResponse,
		] = await Promise.all([
			fetch("/api/internal/financial/operations", { headers: { accept: "application/json" } }),
			fetch("/api/internal/financial/exceptions?status=all&limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/review-events?limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/references?limit=500", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/refund-handoffs?status=all&limit=500", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/reconciliation-queue?limit=250", {
				headers: { accept: "application/json" },
			}),
			fetch("/api/internal/financial/provider-finance", {
				headers: { accept: "application/json" },
			}),
		])
		const emptyPayload = { items: [], degraded: true }
		const operationsPayload = await readWorkspaceJson(operationsResponse, emptyPayload)
		const exceptionsPayload = await readWorkspaceJson(exceptionsResponse, emptyPayload)
		const eventsPayload = await readWorkspaceJson(eventsResponse, emptyPayload)
		const referencesPayload = await readWorkspaceJson(referencesResponse, emptyPayload)
		const handoffsPayload = await readWorkspaceJson(handoffsResponse, emptyPayload)
		const reconciliationPayload = await readWorkspaceJson(reconciliationResponse, emptyPayload)
		const providerFinancePayload = await readWorkspaceJson(providerFinanceResponse, emptyPayload)
		Object.assign(workspaceState, {
			operationsItems: Array.isArray(operationsPayload?.items) ? operationsPayload.items : [],
			workflowItems: Array.isArray(exceptionsPayload?.items) ? exceptionsPayload.items : [],
			reviewEvents: Array.isArray(eventsPayload?.items) ? eventsPayload.items : [],
			persistedReferences: Array.isArray(referencesPayload?.items) ? referencesPayload.items : [],
			persistedRefundHandoffs: Array.isArray(handoffsPayload?.items) ? handoffsPayload.items : [],
			reconciliationItems: Array.isArray(reconciliationPayload?.items)
				? reconciliationPayload.items
				: [],
			providerFinanceItems: Array.isArray(providerFinancePayload?.items)
				? providerFinancePayload.items
				: [],
			duplicateExternalReferences: Array.isArray(reconciliationPayload?.duplicateExternalReferences)
				? reconciliationPayload.duplicateExternalReferences
				: [],
			unmatchedFinancialEvidence:
				reconciliationPayload?.unmatchedEvidence &&
				typeof reconciliationPayload.unmatchedEvidence === "object"
					? reconciliationPayload.unmatchedEvidence
					: { paymentTransactions: [], settlementRecords: [] },
		})
		renderFinancialView()
	}

	async function fetchOperations(): Promise<void> {
		try {
			await fetchWorkspace()
		} catch {
			resetFinancialWorkspaceState(workspaceState)
			renderSummary([])
			renderRows([])
			if (listSummary) listSummary.textContent = "No se pudo cargar la bandeja de Finanzas."
		}
	}

	actorFilter?.addEventListener("change", renderFinancialView)
	queueFilter?.addEventListener("change", renderFinancialView)
	stateFilter?.addEventListener("change", renderFinancialView)
	drawerClose?.addEventListener("click", closeDrawer)
	drawerBackdrop?.addEventListener("click", closeDrawer)
	void fetchOperations()
})()
