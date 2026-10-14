import { registerFinancialReload, registerFinancialPageRetry } from "./financial-load-state"
import {
	searchFinancialBookingCandidates,
	submitExternalEvidenceAssociation,
	submitFinancialReference,
	submitFinancialReviewAction,
	submitReconciliationReviewMarker,
	submitRefundHandoffReview,
} from "./financial-actions"
import { actorNoiseHint } from "./financial-actor-filters"
import {
	fetchFinancialJson,
	financialEndpointUrls,
	financialUrlWithCursor,
	getCachedFinancialJson,
	mergeFinancialPayloadById,
	refreshFinancialJson,
} from "./financial-data-cache"
import { countFinancialQueue, filterFinancialRows } from "./financial-filters"
import { primarySummaryQueues } from "./financial-queues"
import { renderFinancialRowHtml } from "./financial-renderers"
import { financialBookingDetailHref } from "./financial-navigation-scope"
import { financialSegmentMarkup, financialSummaryClass, financialUi } from "./financial-ui-classes"
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
	registerFinancialReload("/financial", fetchOperations)
	const actorFilter = document.getElementById("financialActorFilter") as HTMLSelectElement | null
	const ageFilter = document.getElementById("financialAgeFilter") as HTMLSelectElement | null
	const searchFilter = document.getElementById("financialSearchFilter") as HTMLInputElement | null
	const clearFilters = document.getElementById("financialClearFilters") as HTMLButtonElement | null
	const summaryContainers = Array.from(
		document.querySelectorAll<HTMLElement>("[data-financial-summary]")
	)
	const rows = document.getElementById("financialRows")
	if (!rows || rows.dataset.financialWorkspaceReady === "true") return
	rows.dataset.financialWorkspaceReady = "true"
	const listSummary = document.getElementById("financialListSummary")
	const listHint = document.getElementById("financialListHint")
	const loadMoreWrap = document.getElementById("financialLoadMoreWrap")
	const loadMoreButton = document.getElementById("financialLoadMore")
	const filterSummary = document.getElementById("financialFilterSummary")
	const drawer = document.getElementById("financialReviewDrawer")
	const drawerBackdrop = document.getElementById("financialReviewBackdrop")
	const drawerBody = document.getElementById("financialReviewDrawerBody")
	const drawerClose = document.getElementById("financialReviewDrawerClose")
	const pagingState = {
		operationsLimit: 25,
		operationsPayload: null as any,
		operationsNextCursor: null as string | null,
		operationsHasMore: false,
	}

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
	}
	const savedFilters = new URLSearchParams(location.search)
	for (const [key, control] of [
		["age", ageFilter],
		["actor", actorFilter],
	] as const) {
		const value = savedFilters.get(key)
		if (control && value && Array.from(control.options).some((option) => option.value === value))
			control.value = value
	}
	if (searchFilter) searchFilter.value = savedFilters.get("search") ?? ""
	const savedSegment = savedFilters.get("segment")
	if (savedSegment && primarySummaryQueues.some((item) => item.queue === savedSegment))
		inboxState.segment = savedSegment
	const searchShell = searchFilter?.closest(".financial-search-compact") as HTMLElement | null

	function syncSearchShell(): void {
		if (!searchShell || !searchFilter) return
		const expanded = document.activeElement === searchFilter || searchFilter.value.trim().length > 0
		searchShell.classList.toggle("is-expanded", expanded)
	}

	searchFilter?.addEventListener("focus", syncSearchShell)
	searchFilter?.addEventListener("input", syncSearchShell)
	searchFilter?.addEventListener("blur", syncSearchShell)
	searchFilter?.addEventListener("click", syncSearchShell)
	syncSearchShell()

	clearFilters?.addEventListener("click", () => {
		if (actorFilter) actorFilter.value = "all"
		if (ageFilter) ageFilter.value = "all"
		if (searchFilter) searchFilter.value = ""
		renderFinancialView()
	})

	const rowFor = (item: any) => rowViewFor(workspaceState, item)
	const refundFor = (item: any) => refundHandoffFor(workspaceState, item)

	function currentFilters() {
		return {
			actor: String(actorFilter?.value || "all") as any,
			segment: inboxState.segment,
			search: String(searchFilter?.value || ""),
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
		if (!summaryContainers.length) return
		const metrics = primarySummaryQueues.map((metric) => ({
			...metric,
			value: countQueue(items, metric.queue),
		}))
		const markup = metrics
			.map((metric) => {
				const active = metric.queue === inboxState.segment
				const buttonClass = financialSummaryClass(active)
				return `<button type="button" data-queue="${metric.queue}" data-active="${active ? "true" : "false"}" class="${buttonClass}">
					${financialSegmentMarkup(metric.label, metric.value)}
				</button>`
			})
			.join("")
		summaryContainers.forEach((summary) => {
			summary.innerHTML = markup
			summary.querySelectorAll("[data-queue]").forEach((button) => {
				button.addEventListener("click", () => {
					inboxState.segment = String(button.getAttribute("data-queue") || "needs_action_today")
					button.closest("[data-financial-popover]")?.removeAttribute("open")
					renderFinancialView()
				})
			})
		})
	}

	function selectedOptionLabel(select: HTMLSelectElement | null, fallback: string): string {
		return select?.selectedOptions?.[0]?.textContent?.trim() || fallback
	}

	function renderFilterSummary(): void {
		if (!filterSummary) return
		const actorLabel = actorFilter ? selectedOptionLabel(actorFilter, "Todos los responsables") : ""
		const ageLabel = selectedOptionLabel(ageFilter, "Todas")
		const parts = [actorLabel, ageLabel === "Todas" ? "Cualquier antigüedad" : ageLabel].filter(
			Boolean
		)
		filterSummary.textContent = parts.join(" · ")
	}

	function renderEmptyRows(): void {
		if (!rows) return
		const filters = currentFilters()
		const filtered = Boolean(filters.search || filters.age !== "all" || filters.actor !== "all")
		const nextSegment = primarySummaryQueues.find(
			(metric) =>
				metric.queue !== inboxState.segment &&
				countQueue(workspaceState.combinedItems, metric.queue) > 0
		)
		const message = filtered
			? "No encontramos casos con estos filtros."
			: nextSegment
				? "No hay casos en este estado. Hay pendientes en otro estado."
				: pagingState.operationsHasMore
					? "No hay pendientes entre los casos cargados."
					: inboxState.segment === "needs_action_today"
						? "No tienes pendientes financieros."
						: "No hay casos en este estado."
		const action = filtered
			? `<button type="button" data-empty-clear class="mt-3 ${financialUi.buttonSecondarySm}">Limpiar filtros</button>`
			: nextSegment
				? `<button type="button" data-empty-queue="${nextSegment.queue}" class="mt-3 ${financialUi.buttonSecondarySm}">Ver ${escapeHtml(nextSegment.label.toLowerCase())}</button>`
				: `<a href="${financialBookingDetailHref("")}" class="mt-3 inline-block ${financialUi.buttonSecondarySm}">Ver reservas</a>`
		rows.innerHTML = `<div class="${financialUi.emptyState}"><div class="mx-auto max-w-md"><p class="text-sm font-semibold text-slate-700">${message}</p><p class="mt-1 text-xs text-slate-500">Aquí aparecerán las reservas que necesiten revisar un cobro o una devolución.</p>${action}</div></div>`
		rows.querySelector("[data-empty-clear]")?.addEventListener("click", () => {
			if (searchFilter) searchFilter.value = ""
			if (ageFilter) ageFilter.value = "all"
			if (actorFilter) actorFilter.value = "all"
			renderFinancialView()
		})
		rows.querySelectorAll("[data-empty-queue]").forEach((button) =>
			button.addEventListener("click", () => {
				inboxState.segment = String(button.getAttribute("data-empty-queue"))
				renderFinancialView()
			})
		)
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
				onEvidenceAssociation: () => void submitEvidenceAssociation(),
				onEvidenceAssociationSearch: (query, options) =>
					searchFinancialBookingCandidates(query, options),
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

	async function submitEvidenceAssociation(): Promise<void> {
		const evidenceIssue = workspaceState.selectedItem?.evidenceIssue
		const bookingId = fieldValue("financialEvidenceBookingId").trim()
		const reason = fieldValue("financialEvidenceAssociationReason").trim()
		const errorNotice = document.getElementById("financialEvidenceAssociationError")
		const submitButton = document.querySelector<HTMLButtonElement>(
			"[data-evidence-association-action]"
		)
		const showError = (message: string) => {
			if (!errorNotice) return
			errorNotice.textContent = message
			errorNotice.classList.remove("hidden")
			errorNotice.focus({ preventScroll: true })
		}
		if (!evidenceIssue?.evidenceId || !bookingId || !reason) {
			showError("Selecciona una reserva y explica por qué corresponde a este comprobante.")
			return
		}
		errorNotice?.classList.add("hidden")
		if (submitButton) {
			submitButton.disabled = true
			submitButton.setAttribute("aria-disabled", "true")
			submitButton.textContent = "Asociando…"
		}
		try {
			const response = await submitExternalEvidenceAssociation({
				evidenceType: evidenceIssue.evidenceType,
				evidenceId: evidenceIssue.evidenceId,
				bookingId,
				reason,
			})
			if (!response.ok) {
				const message =
					response.status === 409
						? "Este comprobante ya fue asociado. Actualiza la bandeja para revisar su estado."
						: response.status === 403
							? "Tu rol no tiene permiso para asociar comprobantes financieros."
							: "No pudimos completar la asociación. Verifica que la reserva y el comprobante sigan disponibles."
				showError(message)
				return
			}
			await fetchWorkspace()
			await reopenSelectedOrClose()
		} catch {
			showError(
				"La conexión se interrumpió y no pudimos confirmar el estado final. Actualiza la bandeja antes de reintentar."
			)
		} finally {
			if (submitButton?.isConnected) {
				submitButton.disabled = false
				submitButton.setAttribute("aria-disabled", "false")
				submitButton.textContent = "Confirmar asociación"
			}
		}
	}

	function renderFinancialView(): void {
		if (location.pathname === "/financial") {
			const params = new URLSearchParams(location.search)
			for (const [key, value] of Object.entries(currentFilters())) {
				if (value && value !== "all" && !(key === "segment" && value === "needs_action_today"))
					params.set(key, value)
				else params.delete(key)
			}
			history.replaceState(history.state, "", location.pathname + (params.size ? `?${params}` : ""))
		}

		mergeFinancialWorkspaceItems(workspaceState)
		const filteredItems = applyFilters(workspaceState.combinedItems)
		const completelyEmpty =
			workspaceState.combinedItems.length === 0 &&
			!currentFilters().search &&
			currentFilters().age === "all" &&
			currentFilters().actor === "all"
		const section = rows?.closest<HTMLElement>("[data-financial-view]")
		if (section) section.dataset.financialEmpty = completelyEmpty ? "true" : "false"
		const controls = section?.querySelector<HTMLElement>("[data-financial-inbox-toolbar]")
		if (controls) controls.hidden = completelyEmpty
		renderSummary(workspaceState.combinedItems)
		renderFilterSummary()
		renderRows(filteredItems)
		if (listSummary) {
			const openCount = countQueue(workspaceState.combinedItems, "needs_action_today")
			const shownCount = filteredItems.length
			const actor = String(actorFilter?.value || "all") as any
			listSummary.textContent = `${pagingState.operationsHasMore ? "Entre los casos cargados: " : ""}${openCount} ${openCount === 1 ? "caso requiere" : "casos requieren"} atención. Mostrando ${shownCount}.`
			if (listHint) listHint.textContent = actorNoiseHint(actor)
		}
		if (loadMoreWrap) loadMoreWrap.classList.toggle("hidden", !pagingState.operationsHasMore)
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
		pagingState.operationsPayload = operationsPayload
		pagingState.operationsNextCursor =
			String(operationsPayload?.pagination?.nextCursor || "") || null
		pagingState.operationsHasMore = Boolean(
			operationsPayload?.pagination?.hasMore && pagingState.operationsNextCursor
		)
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
		if (
			!operationsPayload &&
			!exceptionsPayload &&
			!eventsPayload &&
			!referencesPayload &&
			!handoffsPayload
		) {
			return null
		}
		return {
			operationsPayload: operationsPayload || { items: [], degraded: true },
			exceptionsPayload: exceptionsPayload || { items: [], degraded: true },
			eventsPayload: eventsPayload || { items: [], degraded: true },
			referencesPayload: referencesPayload || { items: [], degraded: true },
			handoffsPayload: handoffsPayload || { items: [], degraded: true },
			reconciliationPayload: { items: [], deferred: true },
			providerFinancePayload: { items: [], deferred: true },
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
		] = await Promise.all([
			load(
				financialUrlWithCursor(financialEndpointUrls.operations, {
					limit: pagingState.operationsLimit,
				})
			).catch(() => getCachedFinancialJson(financialEndpointUrls.operations) ?? emptyPayload),
			load(financialEndpointUrls.exceptions).catch(
				() => getCachedFinancialJson(financialEndpointUrls.exceptions) ?? emptyPayload
			),
			load(financialEndpointUrls.reviewEvents).catch(
				() => getCachedFinancialJson(financialEndpointUrls.reviewEvents) ?? emptyPayload
			),
			load(financialEndpointUrls.references).catch(
				() => getCachedFinancialJson(financialEndpointUrls.references) ?? emptyPayload
			),
			load(financialEndpointUrls.refundHandoffs).catch(
				() => getCachedFinancialJson(financialEndpointUrls.refundHandoffs) ?? emptyPayload
			),
		])
		return {
			operationsPayload,
			exceptionsPayload,
			eventsPayload,
			referencesPayload,
			handoffsPayload,
			reconciliationPayload: { items: [], deferred: true },
			providerFinancePayload: { items: [], deferred: true },
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
	ageFilter?.addEventListener("change", renderFinancialView)
	searchFilter?.addEventListener("input", renderFinancialView)
	const loadNextPage = async () => {
		if (loadMoreButton instanceof HTMLButtonElement) {
			loadMoreButton.disabled = true
			loadMoreButton.textContent = "Cargando..."
		}
		const nextCursor = pagingState.operationsNextCursor
		try {
			if (!nextCursor) return
			const nextOperationsPayload = await fetchFinancialJson(
				financialUrlWithCursor(financialEndpointUrls.operations, {
					limit: pagingState.operationsLimit,
					cursor: nextCursor,
				}),
				{ force: true }
			)
			applyWorkspacePayloads({
				operationsPayload: mergeFinancialPayloadById(
					pagingState.operationsPayload,
					nextOperationsPayload,
					(item) => String(item?.bookingId || "")
				),
				exceptionsPayload: getCachedFinancialJson(financialEndpointUrls.exceptions) || {
					items: [],
				},
				eventsPayload: getCachedFinancialJson(financialEndpointUrls.reviewEvents) || { items: [] },
				referencesPayload: getCachedFinancialJson(financialEndpointUrls.references) || {
					items: [],
				},
				handoffsPayload: getCachedFinancialJson(financialEndpointUrls.refundHandoffs) || {
					items: [],
				},
				reconciliationPayload: { items: [], deferred: true },
				providerFinancePayload: { items: [], deferred: true },
			})
		} catch {
			// Failed pages preserve the current rows and cursor for retry.
		} finally {
			if (loadMoreButton instanceof HTMLButtonElement) {
				loadMoreButton.disabled = false
				loadMoreButton.textContent = "Cargar más casos"
			}
		}
	}
	loadMoreButton?.addEventListener("click", () => void loadNextPage())
	registerFinancialPageRetry("/financial", loadNextPage)
	drawerClose?.addEventListener("click", closeDrawer)
	drawerBackdrop?.addEventListener("click", closeDrawer)
	void fetchOperations()
}
