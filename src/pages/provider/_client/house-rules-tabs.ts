const ROOT_SELECTOR = "[data-house-rules-tabs]"
const TAB_SELECTOR = "[data-house-rules-tab]"
const PANEL_SELECTOR = "[data-house-rules-panel]"
const VISTA_INPUT_SELECTOR = "[data-house-rules-vista]"

const HOUSE_RULE_VIEWS = new Set(["essential", "arrival", "optional", "preview"])

let installed = false

function normalizeView(value: string | null | undefined) {
	return HOUSE_RULE_VIEWS.has(value ?? "") ? String(value) : ""
}

function viewFromLocation() {
	const url = new URL(window.location.href)
	const fromQuery = normalizeView(url.searchParams.get("vista"))
	if (fromQuery) return fromQuery
	if (url.searchParams.get("focus") === "arrival") return "arrival"
	const activeTab = document.querySelector<HTMLElement>(`${TAB_SELECTOR}[data-active="true"]`)
	return normalizeView(activeTab?.dataset.houseRulesTab) || "essential"
}

export function renderHouseRulesView(root: Element, requestedView: string, updateUrl = false) {
	const view = normalizeView(requestedView) || "essential"

	for (const panel of root.querySelectorAll<HTMLElement>(PANEL_SELECTOR)) {
		panel.toggleAttribute("hidden", panel.dataset.houseRulesPanel !== view)
	}

	for (const tab of root.querySelectorAll<HTMLElement>(TAB_SELECTOR)) {
		const active = tab.dataset.houseRulesTab === view
		tab.dataset.active = active ? "true" : "false"
		tab.classList.toggle("text-slate-600", !active)
		tab.classList.toggle("hover:bg-sky-100/80", !active)
		tab.classList.toggle("hover:text-sky-950", !active)
		if (active) tab.setAttribute("aria-current", "page")
		else tab.removeAttribute("aria-current")
	}

	for (const input of document.querySelectorAll<HTMLInputElement>(VISTA_INPUT_SELECTOR)) {
		input.value = view
	}

	if (updateUrl) {
		const url = new URL(window.location.href)
		url.searchParams.set("vista", view)
		url.searchParams.delete("focus")
		window.history.pushState({ houseRulesView: view }, "", url)
	}
}

function renderCurrentView() {
	const root = document.querySelector(ROOT_SELECTOR)
	if (!root) return
	renderHouseRulesView(root, viewFromLocation())
}

export function installHouseRulesTabsController() {
	if (installed) return
	installed = true

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target
			if (!(target instanceof Element)) return
			const tab = target.closest<HTMLElement>(TAB_SELECTOR)
			const root = tab?.closest(ROOT_SELECTOR)
			if (!tab || !root) return
			event.preventDefault()
			event.stopPropagation()
			renderHouseRulesView(root, tab.dataset.houseRulesTab ?? "essential", true)
		},
		{ capture: true }
	)
	window.addEventListener("popstate", renderCurrentView)
	document.addEventListener("astro:page-load", renderCurrentView)
	renderCurrentView()
}
