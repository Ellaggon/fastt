import {
	endpointsForFinancialPath,
	financialRouteEndpointMap,
	prewarmFinancialEndpoints,
} from "./financial-data-cache"
import { initFinancialWorkspaceRouter, viewForFinancialPath } from "./financial-workspace-router"

type WorkspaceLoader = () => Promise<Record<string, unknown>>
type FinancialViewId =
	| "inbox"
	| "collections"
	| "settlements"
	| "provider-payables"
	| "refunds"
	| "exceptions"

const workspaceLoaders: Array<{
	view: FinancialViewId
	selector: string
	load: WorkspaceLoader
	initName: string
}> = [
	{
		view: "inbox",
		selector: "#financialRows",
		load: () => import("./financial-workspace"),
		initName: "initFinancialWorkspace",
	},
	{
		view: "collections",
		selector: "#collectionsRows",
		load: () => import("../collections/_client/collections-workspace"),
		initName: "initCollectionsWorkspace",
	},
	{
		view: "settlements",
		selector: "#settlementsRows",
		load: () => import("../settlements/_client/settlements-workspace"),
		initName: "initSettlementsWorkspace",
	},
	{
		view: "provider-payables",
		selector: "#providerPayablesRows",
		load: () => import("../provider-payables/_client/provider-payables-workspace"),
		initName: "initProviderPayablesWorkspace",
	},
	{
		view: "refunds",
		selector: "#refundsRows",
		load: () => import("../refunds/_client/refunds-workspace"),
		initName: "initRefundsWorkspace",
	},
	{
		view: "exceptions",
		selector: "#financialExceptionsRows",
		load: () => import("../exceptions/_client/exceptions-workspace"),
		initName: "initFinancialExceptionsWorkspace",
	},
]

/** In-flight boots only — must not outlive an Astro DOM swap. */
const bootingViews = new Set<FinancialViewId>()

export async function bootFinancialView(view: FinancialViewId | null): Promise<void> {
	if (!view || bootingViews.has(view)) return
	const workspace = workspaceLoaders.find((entry) => entry.view === view)
	if (!workspace || !document.querySelector(workspace.selector)) return
	bootingViews.add(view)
	try {
		const module = await workspace.load()
		// DOM may have been replaced while the module was loading; re-check.
		if (!document.querySelector(workspace.selector)) return
		const init = module[workspace.initName]
		if (typeof init === "function") init()
	} finally {
		bootingViews.delete(view)
	}
}

export function prewarmCurrentFinancialPage(): void {
	prewarmFinancialEndpoints(endpointsForFinancialPath(window.location.pathname))
}

export function wireFinancialNavigationPrewarm(): void {
	document.querySelectorAll<HTMLAnchorElement>("a[data-financial-nav]").forEach((link) => {
		if (link.dataset.financialPrewarmWired === "true") return
		link.dataset.financialPrewarmWired = "true"
		const prewarm = () => {
			const pathname = new URL(link.href).pathname.replace(/\/$/, "") || "/"
			prewarmFinancialEndpoints(financialRouteEndpointMap[pathname] || [])
			void bootFinancialView(viewForFinancialPath(pathname))
		}
		link.addEventListener("pointerenter", prewarm, { passive: true })
		link.addEventListener("focus", prewarm)
	})
}

export function bootFinancialExperience(): void {
	initFinancialWorkspaceRouter((view) => void bootFinancialView(view))
	prewarmCurrentFinancialPage()
	wireFinancialNavigationPrewarm()
	void bootFinancialView(viewForFinancialPath(window.location.pathname))
}
