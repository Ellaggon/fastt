import { buildFinancialDrawerViewModel } from "./financial-drawer-view-model"
import { renderFinancialDrawerContent } from "./financial-drawer-sections"
import type { FinancialBookingCandidate } from "./financial-actions"
import type { FinancialWorkspaceState } from "./financial-workspace-state"
import {
	evidenceEntriesFor,
	eventsFor,
	formatDate,
	itemKey,
	reconciliationFor,
	referencesFor,
	refundHandoffAge,
	refundHandoffFor,
	rowViewFor,
} from "./financial-workspace-selectors"

export type DrawerRenderDeps = {
	escapeHtml: (value: unknown) => string
	money: (currency: unknown, value: unknown) => string
	label: (value: unknown) => string
	statusChip: (status: unknown) => string
	ownerChip: (owner: unknown) => string
	handoffStatusChip: (status: unknown) => string
	handoffStatusLabel: (status: unknown) => string
	operationalAge: (item: any) => string
}

export type DrawerActionHandlers = {
	onReviewAction: (action: string) => void
	onReferenceAction: () => void
	onRefundHandoffAction: (action: string) => void
	onReconciliationAction: () => void
	onEvidenceAssociation: () => void
	onEvidenceAssociationSearch: (
		query: string,
		options?: { signal?: AbortSignal }
	) => Promise<FinancialBookingCandidate[]>
}

export function closeFinancialDrawer(params: {
	state: FinancialWorkspaceState
	drawer: HTMLElement | null
	drawerBackdrop: HTMLElement | null
}): void {
	params.state.selectedItem = null
	document.querySelectorAll("[data-financial-floating-panel]").forEach((panel) => panel.remove())
	document.body.classList.remove("overflow-hidden")
	params.drawer?.classList.add("translate-x-full")
	params.drawerBackdrop?.classList.add("hidden")
}

export function openFinancialDrawer(params: {
	state: FinancialWorkspaceState
	item: any
	drawer: HTMLElement | null
	drawerBackdrop: HTMLElement | null
	drawerBody: HTMLElement | null
	canReview: boolean
	canReviewHandoff: boolean
	duplicateExternalReferences: any[]
	deps: DrawerRenderDeps
	handlers: DrawerActionHandlers
}): void {
	const {
		state,
		item,
		drawer,
		drawerBackdrop,
		drawerBody,
		canReview,
		canReviewHandoff,
		duplicateExternalReferences,
		deps,
		handlers,
	} = params
	state.selectedItem = item
	const handoff = refundHandoffFor(state, item)
	const refundEvidence = referencesFor(state, item).filter(
		(reference) => reference.type === "refund_evidence"
	)
	const duplicateSignals = duplicateExternalReferences.filter((signal) =>
		(signal.bookingIds || []).includes(item.bookingId)
	)
	const drawerView = buildFinancialDrawerViewModel({
		row: rowViewFor(state, item),
		reconciliationMatch: reconciliationFor(state, item),
		evidenceEntries: evidenceEntriesFor(state, item),
		duplicateSignals,
	})
	if (drawerBody) {
		document.querySelectorAll("[data-financial-floating-panel]").forEach((panel) => panel.remove())
		document.body.classList.remove("overflow-hidden")
		drawerBody.innerHTML = renderFinancialDrawerContent(
			{
				viewModel: drawerView,
				refundHandoff: handoff,
				refundEvidence,
				events: eventsFor(state, item),
				canReview,
				canReviewHandoff,
			},
			{
				...deps,
				formatDate,
				refundHandoffAge,
			}
		)
		wireFinancialDrawerActions(drawerBody, handlers)
	}
	drawer?.classList.remove("translate-x-full")
	drawerBackdrop?.classList.remove("hidden")
}

export function wireFinancialDrawerActions(
	drawerBody: HTMLElement,
	handlers: DrawerActionHandlers
): void {
	const panelReturnFocus = new Map<string, HTMLElement>()

	function openPanel(panelId: string): void {
		const panel =
			drawerBody.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`) ||
			document.getElementById(panelId)
		if (!panel) return
		if (panel instanceof HTMLDetailsElement) {
			panel.open = true
			panel.scrollIntoView({ behavior: "smooth", block: "start" })
			return
		}
		if (panel.hasAttribute("data-financial-floating-panel")) {
			if (document.activeElement instanceof HTMLElement) {
				panelReturnFocus.set(panelId, document.activeElement)
			}
			document.body.appendChild(panel)
			document.body.classList.add("overflow-hidden")
		}
		panel.classList.remove("hidden")
		panel.classList.add("flex")
		if (panelId === "financialEvidenceAssociationModal") {
			wireFinancialEvidenceBookingSearch(panel, handlers, () => closePanel(panelId))
		}
	}

	function closePanel(panelId: string): void {
		const panel =
			drawerBody.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`) ||
			document.getElementById(panelId)
		if (!panel) return
		panel.dispatchEvent(new Event("financial-panel-close"))
		panel.classList.add("hidden")
		panel.classList.remove("flex")
		if (panel.hasAttribute("data-financial-floating-panel")) {
			document.body.classList.remove("overflow-hidden")
		}
		panelReturnFocus.get(panelId)?.focus()
		panelReturnFocus.delete(panelId)
	}

	drawerBody.querySelectorAll("[data-open-details]").forEach((button) => {
		button.addEventListener("click", () => {
			const detailsId = String(button.getAttribute("data-open-details") || "")
			openPanel(detailsId)
		})
	})
	drawerBody.querySelectorAll("[data-open-panel]").forEach((button) => {
		button.addEventListener("click", () => {
			openPanel(String(button.getAttribute("data-open-panel") || ""))
		})
	})
	drawerBody.querySelectorAll("[data-close-panel]").forEach((button) => {
		button.addEventListener("click", () => {
			closePanel(String(button.getAttribute("data-close-panel") || ""))
		})
	})
	drawerBody.querySelectorAll("[data-financial-floating-panel]").forEach((panel) => {
		panel.addEventListener("click", (event) => {
			if (event.target === panel) closePanel(panel.id)
		})
	})
	drawerBody.querySelectorAll("[data-review-action]").forEach((button) => {
		button.addEventListener("click", () =>
			handlers.onReviewAction(String(button.getAttribute("data-review-action") || ""))
		)
	})
	drawerBody.querySelectorAll("[data-reference-action]").forEach((button) => {
		button.addEventListener("click", () => handlers.onReferenceAction())
	})
	drawerBody.querySelectorAll("[data-refund-handoff-action]").forEach((button) => {
		button.addEventListener("click", () =>
			handlers.onRefundHandoffAction(
				String(button.getAttribute("data-refund-handoff-action") || "")
			)
		)
	})
	drawerBody.querySelectorAll("[data-reconciliation-action]").forEach((button) => {
		button.addEventListener("click", () => handlers.onReconciliationAction())
	})
	drawerBody.querySelectorAll("[data-evidence-association-action]").forEach((button) => {
		button.addEventListener("click", () => handlers.onEvidenceAssociation())
	})
}

function wireFinancialEvidenceBookingSearch(
	panel: HTMLElement,
	handlers: DrawerActionHandlers,
	onRequestClose: () => void
): void {
	if (panel.dataset.bookingSearchReady === "true") return
	panel.dataset.bookingSearchReady = "true"
	const input = panel.querySelector<HTMLInputElement>("#financialEvidenceBookingSearch")
	const hiddenId = panel.querySelector<HTMLInputElement>("#financialEvidenceBookingId")
	const results = panel.querySelector<HTMLElement>("#financialEvidenceBookingResults")
	const status = panel.querySelector<HTMLElement>("#financialEvidenceBookingSearchStatus")
	const selection = panel.querySelector<HTMLElement>("#financialEvidenceBookingSelection")
	const reason = panel.querySelector<HTMLTextAreaElement>("#financialEvidenceAssociationReason")
	const confirm = panel.querySelector<HTMLButtonElement>("[data-evidence-association-action]")
	if (!input || !hiddenId || !results || !status || !selection || !reason || !confirm) return

	let candidates: FinancialBookingCandidate[] = []
	let activeIndex = -1
	let requestSequence = 0
	let debounceTimer: ReturnType<typeof setTimeout> | null = null
	let activeRequest: AbortController | null = null

	const displayDate = (value: string | null) => {
		if (!value) return "Sin fechas"
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
		return match ? `${match[3]}/${match[2]}/${match[1]}` : value
	}
	const candidateLabel = (candidate: FinancialBookingCandidate) =>
		candidate.externalBookingId || `Reserva ${candidate.id.slice(0, 8)}`
	const candidateAmount = (candidate: FinancialBookingCandidate) => {
		const currency = candidate.currency || "USD"
		try {
			return new Intl.NumberFormat("es-BO", {
				style: "currency",
				currency,
				maximumFractionDigits: 2,
			}).format(candidate.totalAmount)
		} catch {
			return `${currency} ${candidate.totalAmount.toFixed(2)}`
		}
	}
	const candidateStatus = (candidate: FinancialBookingCandidate) => {
		const labels: Record<string, string> = {
			confirmed: "Confirmada",
			pending: "Pendiente",
			completed: "Completada",
			cancelled: "Cancelada",
			canceled: "Cancelada",
		}
		return labels[candidate.status.toLowerCase()] || "Reserva"
	}
	const candidateDetail = (candidate: FinancialBookingCandidate) => {
		const guest = candidate.guestName || candidate.guestEmail || "Huésped sin identificar"
		const product = [candidate.productName, candidate.variantName].filter(Boolean).join(" · ")
		const dates = `${displayDate(candidate.checkIn)} - ${displayDate(candidate.checkOut)}`
		return [guest, product, dates, candidateStatus(candidate)].filter(Boolean).join(" · ")
	}
	const updateConfirmState = () => {
		const disabled = !hiddenId.value || !reason.value.trim()
		confirm.disabled = disabled
		confirm.setAttribute("aria-disabled", String(disabled))
	}
	const updateActive = () => {
		results.querySelectorAll<HTMLElement>("[data-booking-candidate-index]").forEach((element) => {
			const index = Number(element.dataset.bookingCandidateIndex)
			element.classList.toggle("bg-slate-100", index === activeIndex)
			element.setAttribute("aria-selected", index === activeIndex ? "true" : "false")
		})
		const active = results.querySelector<HTMLElement>(
			`[data-booking-candidate-index="${activeIndex}"]`
		)
		if (active?.id) input.setAttribute("aria-activedescendant", active.id)
		else input.removeAttribute("aria-activedescendant")
	}
	const selectCandidate = (candidate: FinancialBookingCandidate) => {
		hiddenId.value = candidate.id
		input.value = candidateLabel(candidate)
		selection.textContent = `Seleccionada: ${candidateLabel(candidate)} · ${candidateDetail(candidate)}`
		selection.classList.remove("hidden")
		results.classList.add("hidden")
		input.setAttribute("aria-expanded", "false")
		status.textContent = "Reserva lista para asociar."
		updateConfirmState()
	}
	const render = () => {
		results.replaceChildren()
		if (!candidates.length) {
			results.classList.add("hidden")
			input.setAttribute("aria-expanded", "false")
			return
		}
		for (const [index, candidate] of candidates.entries()) {
			const option = document.createElement("button")
			option.type = "button"
			option.role = "option"
			option.id = `financialEvidenceBookingOption-${index}`
			option.dataset.bookingCandidateIndex = String(index)
			option.className =
				"block w-full rounded-md px-3 py-2.5 text-left transition hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
			const heading = document.createElement("div")
			heading.className = "flex items-baseline justify-between gap-3"
			const title = document.createElement("div")
			title.className = "min-w-0 truncate text-sm font-semibold text-slate-900"
			title.textContent = candidateLabel(candidate)
			const amount = document.createElement("div")
			amount.className = "shrink-0 text-sm font-semibold text-slate-800"
			amount.textContent = candidateAmount(candidate)
			heading.append(title, amount)
			const detail = document.createElement("div")
			detail.className = "mt-0.5 text-xs leading-5 text-slate-500"
			detail.textContent = candidateDetail(candidate)
			option.append(heading, detail)
			option.addEventListener("click", () => selectCandidate(candidate))
			results.append(option)
		}
		results.classList.remove("hidden")
		input.setAttribute("aria-expanded", "true")
		updateActive()
	}
	const search = async (rawQuery: string) => {
		const query = rawQuery.trim()
		if (query.length === 1) {
			candidates = []
			render()
			status.textContent = "Escribe al menos 2 caracteres para buscar."
			return
		}
		const sequence = ++requestSequence
		activeRequest?.abort()
		activeRequest = new AbortController()
		status.textContent = query ? "Buscando reservas…" : "Cargando reservas recientes…"
		try {
			const next = await handlers.onEvidenceAssociationSearch(query, {
				signal: activeRequest.signal,
			})
			if (sequence !== requestSequence) return
			candidates = next
			activeIndex = -1
			render()
			status.textContent = next.length
				? next.length === 10
					? "Mostrando los 10 resultados más relevantes. Escribe más datos para acotar."
					: `${next.length} ${next.length === 1 ? "reserva encontrada" : "reservas encontradas"}.`
				: "No encontramos una reserva con esos datos."
		} catch (error) {
			if (sequence !== requestSequence) return
			if (error instanceof DOMException && error.name === "AbortError") return
			candidates = []
			render()
			status.textContent = "No se pudo buscar ahora. Inténtalo de nuevo."
		}
	}
	const scheduleSearch = () => {
		hiddenId.value = ""
		selection.classList.add("hidden")
		updateConfirmState()
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => void search(input.value), 220)
	}
	input.addEventListener("input", scheduleSearch)
	input.addEventListener("focus", () => {
		if (!hiddenId.value) void search(input.value)
	})
	reason.addEventListener("input", updateConfirmState)
	input.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" && candidates.length) {
			event.preventDefault()
			activeIndex = Math.min(activeIndex + 1, candidates.length - 1)
			updateActive()
		} else if (event.key === "ArrowUp" && candidates.length) {
			event.preventDefault()
			activeIndex = Math.max(activeIndex - 1, 0)
			updateActive()
		} else if (event.key === "Enter" && activeIndex >= 0) {
			event.preventDefault()
			selectCandidate(candidates[activeIndex])
		} else if (event.key === "Escape") {
			if (!results.classList.contains("hidden")) {
				event.stopPropagation()
				results.classList.add("hidden")
				input.setAttribute("aria-expanded", "false")
			} else {
				onRequestClose()
			}
		}
	})
	panel.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && event.target !== input) onRequestClose()
		if (event.key !== "Tab") return
		const focusable = Array.from(
			panel.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => !element.closest(".hidden"))
		if (!focusable.length) return
		const first = focusable[0]
		const last = focusable[focusable.length - 1]
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first.focus()
		}
	})
	panel.addEventListener("financial-panel-close", () => {
		if (debounceTimer) clearTimeout(debounceTimer)
		activeRequest?.abort()
		results.classList.add("hidden")
		input.setAttribute("aria-expanded", "false")
	})
	updateConfirmState()
	queueMicrotask(() => input.focus())
}

export function selectedItemStillVisible(state: FinancialWorkspaceState): any | null {
	if (!state.selectedItem) return null
	return state.combinedItems.find((entry) => itemKey(entry) === itemKey(state.selectedItem)) || null
}
