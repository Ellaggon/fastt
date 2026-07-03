import {
	submitFinancialReference,
	submitFinancialReviewAction,
	submitReconciliationReviewMarker,
	submitRefundHandoffReview,
} from "./financial-actions"
import { actorNoiseHint } from "./financial-actor-filters"
import {
	fetchFinancialJson,
	financialEndpointUrls,
	getCachedFinancialJson,
	refreshFinancialJson,
} from "./financial-data-cache"
import { countFinancialQueue, filterFinancialRows } from "./financial-filters"
import { primarySummaryQueues, workTypeOptions } from "./financial-queues"
import { renderFinancialRowHtml } from "./financial-renderers"
import { financialSegmentClass, financialSummaryClass, financialUi } from "./financial-ui-classes"
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
	refundHandoffDerivedSuppressed,
	refundHandoffFor,
	rowViewFor,
	statusLabel,
} from "./financial-workspace-selectors"

type WorkspacePayloads = {
	operationsPayload: any
	exceptionsPayload: any
	eventsPayload: any
	referencesPayload: any
	handoffsPayload: any
	reconciliationPayload: any
	providerFinancePayload: any
}

export function initFinancialWorkspace(): void {
	const workspaceState = createFinancialWorkspaceState()
	const actorFilter = document.getElementById("financialActorFilter") as HTMLSelectElement | null
	const lodgingFilter = document.getElementById("financialLodgingFilter") as HTMLInputElement | null
	const ageFilter = document.getElementById("financialAgeFilter") as HTMLSelectElement | null
	const searchFilter = document.getElementById("financialSearchFilter") as HTMLInputElement | null
	const workTypeFilters = document.getElementById("financialWorkTypeFilters")
	const summary = document.getElementById("financialSummary")
	const rows = document.getElementById("financialRows")
	if (!rows || rows.dataset.financialWorkspaceReady === "true") return
	rows.dataset.financialWorkspaceReady = "true"
	const listSummary = document.getElementById("financialListSummary")
	const filterSummary = document.getElementById("financialFilterSummary")
	const drawer = document.getElementById("financialReviewDrawer")
	const drawerBackdrop = document.getElementById("financialReviewBackdrop")
	const drawerBody = document.getElementById("financialReviewDrawerBody")
	const drawerClose = document.getElementById("financialReviewDrawerClose")

	const statusClass = (status: unknown): string => {
		const map: Record<string, string> = {
			open: "border-amber-200 bg-amber-50 text-amber-800",
			acknowledged: "border-sky-200 bg-sky-50 text-sky-800",
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
			acknowledged: "border-sky-200 bg-sky-50 text-sky-800",
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
	const inboxState = {
		segment: "needs_action_today",
		workType: "all",
	}

	const rowFor = (item: any) => rowViewFor(workspaceState, item)
	const refundFor = (item: any) => refundHandoffFor(workspaceState, item)

	function currentFilters() {
		return {
			actor: String(actorFilter?.value || "all") as any,
			segment: inboxState.segment,
			workType: inboxState.workType,
			search: String(searchFilter?.value || ""),
			lodging: String(lodgingFilter?.value || ""),
			age: String(ageFilter?.value || "all"),
		}
	}

	function applyFilters(items: any[]): any[] {
		return sortOperationalRows(
			filterFinancialRows({
				items,
				filters: currentFilters(),
				rowFor,
				isTerminalReview,
				isSuppressed: (item) => refundHandoffDerivedSuppressed(workspaceState, item),
			})
		)
	}

	function ageDays(labelText: string): number {
		const match = labelText.match(/\d+/)
		return match ? Number(match[0]) : 0
	}

	function sortOperationalRows(items: any[]): any[] {
		return [...items].sort((left, right) => {
			const leftRow = rowFor(left)
			const rightRow = rowFor(right)
			const leftBlocked = leftRow.isBlocked ? 1 : 0
			const rightBlocked = rightRow.isBlocked ? 1 : 0
			if (leftBlocked !== rightBlocked) return rightBlocked - leftBlocked
			const leftAmount = Number(leftRow.amount || 0)
			const rightAmount = Number(rightRow.amount || 0)
			if (leftAmount !== rightAmount) return rightAmount - leftAmount
			return ageDays(rightRow.ageLabel) - ageDays(leftRow.ageLabel)
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
			.map((metric) => {
				const active = metric.queue === inboxState.segment
				const buttonClass = financialSummaryClass(active)
				const countClass = active ? "font-bold text-white" : "font-bold text-slate-950"
				return `<button type="button" data-queue="${metric.queue}" class="${buttonClass}">
					<span class="${countClass}">${metric.value}</span>
					<span class="ml-1">${metric.label}</span>
				</button>`
			})
			.join("")
		summary.querySelectorAll("[data-queue]").forEach((button) => {
			button.addEventListener("click", () => {
				inboxState.segment = String(button.getAttribute("data-queue") || "needs_action_today")
				renderFinancialView()
			})
		})
	}

	function renderWorkTypeFilters(): void {
		if (!workTypeFilters) return
		workTypeFilters.querySelectorAll<HTMLElement>("[data-work-type]").forEach((button) => {
			const active = String(button.dataset.workType || "all") === inboxState.workType
			button.className = financialSegmentClass(active)
		})
	}

	function selectedOptionLabel(select: HTMLSelectElement | null, fallback: string): string {
		return select?.selectedOptions?.[0]?.textContent?.trim() || fallback
	}

	function renderFilterSummary(): void {
		if (!filterSummary) return
		const workTypeLabel =
			workTypeOptions.find((option) => option.value === inboxState.workType)?.label || "Todos"
		const actorLabel = selectedOptionLabel(actorFilter, "Todos los equipos")
		const ageLabel = selectedOptionLabel(ageFilter, "Todas")
		const lodgingValue = lodgingFilter?.value.trim() || ""
		const parts = [
			workTypeLabel === "Todos" ? "Todos los tipos" : workTypeLabel,
			actorLabel,
			ageLabel === "Todas" ? "" : ageLabel,
			lodgingValue ? `Alojamiento: ${lodgingValue}` : "",
		].filter(Boolean)
		filterSummary.textContent = parts.join(" · ")
	}

	function renderEmptyRows(): void {
		if (!rows) return
		const nextSegment = primarySummaryQueues.find(
			(metric) =>
				metric.queue !== inboxState.segment &&
				countQueue(workspaceState.combinedItems, metric.queue) > 0
		)
		const action = nextSegment
			? `<button type="button" data-empty-queue="${nextSegment.queue}" class="mt-3 ${financialUi.buttonSecondarySm}">Ver ${escapeHtml(nextSegment.label.toLowerCase())}</button>`
			: ""
		const emptyMessages: Record<string, string> = {
			needs_action_today: "No hay casos que requieran atención ahora.",
			blocked: "No hay casos bloqueados en esta vista.",
			waiting_external: "No hay casos esperando respuesta externa.",
			ready_to_close: "No hay casos listos para cerrar.",
			recently_closed: "No hay casos cerrados recientemente.",
		}
		const message = nextSegment
			? `${emptyMessages[inboxState.segment] || "No hay casos en esta vista"} Hay casos en ${nextSegment.label.toLowerCase()}.`
			: emptyMessages[inboxState.segment] || "No hay casos para estos filtros."
		rows.innerHTML = `<div class="${financialUi.emptyState}">
			<div class="mx-auto max-w-md">
				<p class="text-sm font-semibold text-slate-700">${escapeHtml(message)}</p>
				<p class="mt-1 text-xs text-slate-500">Cambia de segmento o ajusta filtros solo si necesitas buscar un caso específico.</p>
				${action}
			</div>
		</div>`
		rows.querySelectorAll("[data-empty-queue]").forEach((button) => {
			button.addEventListener("click", () => {
				inboxState.segment = String(button.getAttribute("data-empty-queue") || "needs_action_today")
				renderFinancialView()
			})
		})
	}

	function renderRows(items: any[]): void {
		if (!rows) return
		rows.innerHTML = ""
		if (!Array.isArray(items) || !items.length) {
			renderEmptyRows()
			return
		}
		for (const item of items) {
			const operation = item.operation || {}
			const wrapper = document.createElement("div")
			const rowView = rowFor(item)
			const handoff = refundFor(item)
			const ownerMarkup =
				handoff && hasAnyCode(item, ["refund_handoff_required"])
					? ownerChip(handoff.nextOwner)
					: ownerChip(rowView.owner)
			wrapper.innerHTML = renderFinancialRowHtml({
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
			const card = wrapper.firstElementChild
			if (card) rows.appendChild(card)
		}
		rows.querySelectorAll<HTMLElement>("[data-review-key]").forEach((card) => {
			card.addEventListener("click", () => {
				const key = String(card.getAttribute("data-review-key") || "")
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
		renderWorkTypeFilters()
		renderFilterSummary()
		renderRows(filteredItems)
		if (listSummary) {
			const openCount = countQueue(workspaceState.combinedItems, "needs_action_today")
			const shownCount = filteredItems.length
			const actor = String(actorFilter?.value || "all") as any
			listSummary.textContent = `${openCount} caso(s) requieren atención. Mostrando ${shownCount}. ${actorNoiseHint(actor)}`
		}
	}

	function applyWorkspacePayloads(payloads: WorkspacePayloads): void {
		const {
			operationsPayload,
			exceptionsPayload,
			eventsPayload,
			referencesPayload,
			handoffsPayload,
			reconciliationPayload,
			providerFinancePayload,
		} = payloads
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

	function cachedWorkspacePayloads(): WorkspacePayloads | null {
		const operationsPayload = getCachedFinancialJson(financialEndpointUrls.operations)
		const exceptionsPayload = getCachedFinancialJson(financialEndpointUrls.exceptions)
		const eventsPayload = getCachedFinancialJson(financialEndpointUrls.reviewEvents)
		const referencesPayload = getCachedFinancialJson(financialEndpointUrls.references)
		const handoffsPayload = getCachedFinancialJson(financialEndpointUrls.refundHandoffs)
		const reconciliationPayload = getCachedFinancialJson(financialEndpointUrls.reconciliationQueue)
		const providerFinancePayload = getCachedFinancialJson(financialEndpointUrls.providerFinance)
		if (
			!operationsPayload &&
			!exceptionsPayload &&
			!eventsPayload &&
			!referencesPayload &&
			!handoffsPayload &&
			!reconciliationPayload &&
			!providerFinancePayload
		) {
			return null
		}
		return {
			operationsPayload: operationsPayload || { items: [], degraded: true },
			exceptionsPayload: exceptionsPayload || { items: [], degraded: true },
			eventsPayload: eventsPayload || { items: [], degraded: true },
			referencesPayload: referencesPayload || { items: [], degraded: true },
			handoffsPayload: handoffsPayload || { items: [], degraded: true },
			reconciliationPayload: reconciliationPayload || { items: [], degraded: true },
			providerFinancePayload: providerFinancePayload || { items: [], degraded: true },
		}
	}

	async function getWorkspacePayloads(
		options: { force?: boolean } = {}
	): Promise<WorkspacePayloads> {
		const load = options.force ? refreshFinancialJson : fetchFinancialJson
		const emptyPayload = { items: [], degraded: true }
		const [
			operationsPayload,
			exceptionsPayload,
			eventsPayload,
			referencesPayload,
			handoffsPayload,
			reconciliationPayload,
			providerFinancePayload,
		] = await Promise.all([
			load(financialEndpointUrls.operations).catch(() => emptyPayload),
			load(financialEndpointUrls.exceptions).catch(() => emptyPayload),
			load(financialEndpointUrls.reviewEvents).catch(() => emptyPayload),
			load(financialEndpointUrls.references).catch(() => emptyPayload),
			load(financialEndpointUrls.refundHandoffs).catch(() => emptyPayload),
			load(financialEndpointUrls.reconciliationQueue).catch(() => emptyPayload),
			load(financialEndpointUrls.providerFinance).catch(() => emptyPayload),
		])
		return {
			operationsPayload,
			exceptionsPayload,
			eventsPayload,
			referencesPayload,
			handoffsPayload,
			reconciliationPayload,
			providerFinancePayload,
		}
	}

	async function fetchWorkspace(): Promise<void> {
		const cachedPayloads = cachedWorkspacePayloads()
		if (cachedPayloads) {
			applyWorkspacePayloads(cachedPayloads)
			void getWorkspacePayloads({ force: true })
				.then(applyWorkspacePayloads)
				.catch(() => {})
			return
		}
		applyWorkspacePayloads(await getWorkspacePayloads())
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
	lodgingFilter?.addEventListener("input", renderFinancialView)
	ageFilter?.addEventListener("change", renderFinancialView)
	searchFilter?.addEventListener("input", renderFinancialView)
	workTypeFilters?.querySelectorAll("[data-work-type]").forEach((button) => {
		button.addEventListener("click", () => {
			inboxState.workType = String((button as HTMLElement).dataset.workType || "all")
			renderFinancialView()
		})
	})
	drawerClose?.addEventListener("click", closeDrawer)
	drawerBackdrop?.addEventListener("click", closeDrawer)
	void fetchOperations()
}
