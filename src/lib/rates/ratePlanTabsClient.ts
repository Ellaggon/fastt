const VIEW_CONTROLLER_SELECTOR = "[data-rate-plan-view-controller]"
let installed = false

function normalizeView(value: string | null | undefined) {
	return value === "drafts" ? "inactive" : value || "attention"
}

function ratePlanMatchesView(state: string, view: string) {
	if (view === "all") return true
	if (view === "ready") return state === "ready"
	if (view === "inactive") return state === "inactive"
	return state !== "ready" && state !== "inactive"
}

export function renderRatePlanView(root: Element, requestedView: string, updateUrl = false) {
	const view = normalizeView(requestedView)
	const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-rate-plan-row]"))
	const visibleRatePlanIds = new Set<string>()

	for (const row of rows) {
		const visible = ratePlanMatchesView(String(row.dataset.ratePlanState ?? ""), view)
		row.classList.toggle("hidden", !visible)
		if (visible) visibleRatePlanIds.add(String(row.dataset.ratePlanId ?? ""))
	}

	const hasVisibleRows = visibleRatePlanIds.size > 0
	root.querySelector("[data-rate-plan-empty]")?.classList.toggle("hidden", hasVisibleRows)
	for (const tab of root.querySelectorAll<HTMLElement>("[data-rate-plan-tab]")) {
		const active = tab.dataset.ratePlanTab === view
		tab.dataset.active = active ? "true" : "false"
		tab.classList.toggle("text-slate-600", !active)
		tab.classList.toggle("hover:bg-sky-100/80", !active)
		tab.classList.toggle("hover:text-sky-950", !active)
		if (active) tab.setAttribute("aria-current", "page")
		else tab.removeAttribute("aria-current")
	}

	if (updateUrl) {
		const url = new URL(window.location.href)
		url.searchParams.set("vista", view)
		window.history.pushState({ ratePlanView: view }, "", url)
	}
}

function renderCurrentView() {
	const root = document.querySelector(VIEW_CONTROLLER_SELECTOR)
	if (!root) return
	renderRatePlanView(root, new URL(window.location.href).searchParams.get("vista") ?? "attention")
}

export function installRatePlanTabsController() {
	if (installed) return
	installed = true

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target
			if (!(target instanceof Element)) return
			const mobileToggle = target.closest<HTMLButtonElement>("[data-rate-plan-mobile-toggle]")
			if (mobileToggle) {
				const row = mobileToggle.closest<HTMLElement>("[data-rate-plan-row]")
				if (!row) return
				const expanded = row.dataset.mobileExpanded !== "true"
				row.dataset.mobileExpanded = expanded ? "true" : "false"
				mobileToggle.setAttribute("aria-expanded", String(expanded))
				return
			}
			const tab = target.closest<HTMLElement>("[data-rate-plan-tab]")
			const root = tab?.closest(VIEW_CONTROLLER_SELECTOR)
			if (!tab || !root) return
			event.preventDefault()
			event.stopPropagation()
			renderRatePlanView(root, tab.dataset.ratePlanTab ?? "attention", true)
		},
		{ capture: true }
	)
	window.addEventListener("popstate", renderCurrentView)
	document.addEventListener("astro:page-load", renderCurrentView)
	renderCurrentView()
}
