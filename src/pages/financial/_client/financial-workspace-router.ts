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

export function viewForFinancialPath(pathname: string): FinancialViewId | null {
	return routeToView[normalizePath(pathname)] || null
}

function applyFinancialView(view: FinancialViewId): void {
	document.querySelectorAll<HTMLElement>("[data-financial-view]").forEach((section) => {
		section.classList.toggle("hidden", section.dataset.financialView !== view)
	})
	document.querySelectorAll<HTMLAnchorElement>("a[data-financial-nav]").forEach((link) => {
		const linkView = viewForFinancialPath(new URL(link.href).pathname)
		const active = linkView === view
		link.toggleAttribute("aria-current", active)
		link.dataset.active = active ? "true" : "false"
		link.className = `fastt-tabs-inside-panel__item inline-flex min-w-max shrink-0 items-center px-4 py-2 text-sm font-semibold whitespace-nowrap ${
			active ? "" : "bg-black text-slate-300 hover:bg-slate-800 hover:text-white"
		}`
	})
	document.title = viewTitles[view]
}

function navigateFinancialView(url: URL): void {
	const view = viewForFinancialPath(url.pathname)
	if (!view) return
	window.history.pushState({ financialView: view }, "", `${url.pathname}${url.search}${url.hash}`)
	applyFinancialView(view)
	window.scrollTo({ top: 0, behavior: "instant" })
}

function isSameOriginFinancialNav(link: HTMLAnchorElement): URL | null {
	const url = new URL(link.href)
	if (url.origin !== window.location.origin) return null
	if (!viewForFinancialPath(url.pathname)) return null
	return url
}

export function initFinancialWorkspaceRouter(onViewChange?: (view: FinancialViewId) => void): void {
	const initialView = viewForFinancialPath(window.location.pathname)
	if (!initialView) return
	applyFinancialView(initialView)
	onViewChange?.(initialView)

	if (document.documentElement.dataset.financialRouterReady === "true") return
	document.documentElement.dataset.financialRouterReady = "true"

	// Capture phase so preventDefault runs before Astro ClientRouter's bubble handler.
	// Otherwise ClientRouter swaps in fresh SSR "Cargando…" placeholders and the SPA boot skips.
	document.addEventListener(
		"click",
		(event) => {
			if (event.defaultPrevented) return
			if (event.button !== 0) return
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
			const target = event.target
			if (!(target instanceof Element)) return
			const link = target.closest<HTMLAnchorElement>("a[data-financial-nav]")
			if (!link) return
			const url = isSameOriginFinancialNav(link)
			if (!url) return
			event.preventDefault()
			if (normalizePath(url.pathname) === normalizePath(window.location.pathname)) return
			navigateFinancialView(url)
			const view = viewForFinancialPath(url.pathname)
			if (view) onViewChange?.(view)
		},
		true
	)

	window.addEventListener("popstate", () => {
		const view = viewForFinancialPath(window.location.pathname)
		if (view) {
			applyFinancialView(view)
			onViewChange?.(view)
		}
	})
}
