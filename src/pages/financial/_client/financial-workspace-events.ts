import { buildFinancialDrawerViewModel } from "./financial-drawer-view-model"
import { renderFinancialDrawerContent } from "./financial-drawer-sections"
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
			document.body.appendChild(panel)
			document.body.classList.add("overflow-hidden")
		}
		panel.classList.remove("hidden")
		panel.classList.add("flex")
	}

	function closePanel(panelId: string): void {
		const panel =
			drawerBody.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`) ||
			document.getElementById(panelId)
		if (!panel) return
		panel.classList.add("hidden")
		panel.classList.remove("flex")
		if (panel.hasAttribute("data-financial-floating-panel")) {
			document.body.classList.remove("overflow-hidden")
		}
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
}

export function selectedItemStillVisible(state: FinancialWorkspaceState): any | null {
	if (!state.selectedItem) return null
	return state.combinedItems.find((entry) => itemKey(entry) === itemKey(state.selectedItem)) || null
}
