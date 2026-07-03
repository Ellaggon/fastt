type FinancialViewId =
	| "inbox"
	| "collections"
	| "settlements"
	| "provider-payables"
	| "refunds"
	| "exceptions"

const routeToView: Record<string, FinancialViewId> = {
	"/financial": "inbox",
	"/financial/collections": "collections",
	"/financial/settlements": "settlements",
	"/financial/provider-payables": "provider-payables",
	"/financial/refunds": "refunds",
	"/financial/exceptions": "exceptions",
}

const viewTitles: Record<FinancialViewId, string> = {
	"inbox": "Finanzas",
	"collections": "Finanzas · Cobros",
	"settlements": "Finanzas · Liquidaciones",
	"provider-payables": "Finanzas · Pagos a proveedores",
	"refunds": "Finanzas · Reembolsos",
	"exceptions": "Finanzas · Excepciones",
}

function normalizePath(pathname: string): string {
	return pathname.replace(/\/$/, "") || "/"
}

function viewForPath(pathname: string): FinancialViewId | null {
	return routeToView[normalizePath(pathname)] || null
}

function applyFinancialView(view: FinancialViewId): void {
	document.querySelectorAll<HTMLElement>("[data-financial-view]").forEach((section) => {
		section.classList.toggle("hidden", section.dataset.financialView !== view)
	})
	document.querySelectorAll<HTMLAnchorElement>("a[data-financial-nav]").forEach((link) => {
		const linkView = viewForPath(new URL(link.href).pathname)
		const active = linkView === view
		link.toggleAttribute("aria-current", active)
		link.dataset.active = active ? "true" : "false"
		link.className = `fastt-segmented-item inline-flex h-9 items-center overflow-hidden rounded-full px-3 text-sm font-medium whitespace-nowrap ${
			active ? "" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
		}`
	})
	document.title = viewTitles[view]
}

function navigateFinancialView(url: URL): void {
	const view = viewForPath(url.pathname)
	if (!view) return
	window.history.pushState({ financialView: view }, "", `${url.pathname}${url.search}${url.hash}`)
	applyFinancialView(view)
	window.scrollTo({ top: 0, behavior: "instant" })
}

export function initFinancialWorkspaceRouter(): void {
	const initialView = viewForPath(window.location.pathname)
	if (!initialView) return
	applyFinancialView(initialView)

	if (document.documentElement.dataset.financialRouterReady === "true") return
	document.documentElement.dataset.financialRouterReady = "true"

	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return
		const link = target.closest<HTMLAnchorElement>("a[data-financial-nav]")
		if (!link) return
		const url = new URL(link.href)
		if (url.origin !== window.location.origin) return
		if (!viewForPath(url.pathname)) return
		event.preventDefault()
		if (normalizePath(url.pathname) === normalizePath(window.location.pathname)) return
		navigateFinancialView(url)
	})

	window.addEventListener("popstate", () => {
		const view = viewForPath(window.location.pathname)
		if (view) applyFinancialView(view)
	})
}
