import {
	endpointsForFinancialPath,
	financialRouteEndpointMap,
	prewarmFinancialEndpoints,
} from "./financial-data-cache"

type WorkspaceLoader = () => Promise<Record<string, unknown>>

const workspaceLoaders: Array<{
	selector: string
	load: WorkspaceLoader
	initName: string
}> = [
	{
		selector: "#financialRows",
		load: () => import("./financial-workspace"),
		initName: "initFinancialWorkspace",
	},
	{
		selector: "#collectionsRows",
		load: () => import("../collections/_client/collections-workspace"),
		initName: "initCollectionsWorkspace",
	},
	{
		selector: "#settlementsRows",
		load: () => import("../settlements/_client/settlements-workspace"),
		initName: "initSettlementsWorkspace",
	},
	{
		selector: "#providerPayablesRows",
		load: () => import("../provider-payables/_client/provider-payables-workspace"),
		initName: "initProviderPayablesWorkspace",
	},
	{
		selector: "#refundsRows",
		load: () => import("../refunds/_client/refunds-workspace"),
		initName: "initRefundsWorkspace",
	},
	{
		selector: "#financialExceptionsRows",
		load: () => import("../exceptions/_client/exceptions-workspace"),
		initName: "initFinancialExceptionsWorkspace",
	},
]

export async function bootFinancialPage(): Promise<void> {
	for (const workspace of workspaceLoaders) {
		if (!document.querySelector(workspace.selector)) continue
		const module = await workspace.load()
		const init = module[workspace.initName]
		if (typeof init === "function") init()
		return
	}
}

export function prewarmCurrentFinancialPage(): void {
	prewarmFinancialEndpoints(endpointsForFinancialPath(window.location.pathname))
}

export function wireFinancialNavigationPrewarm(): void {
	document.querySelectorAll<HTMLAnchorElement>("a[data-financial-nav]").forEach((link) => {
		const prewarm = () => {
			const pathname = new URL(link.href).pathname.replace(/\/$/, "") || "/"
			prewarmFinancialEndpoints(financialRouteEndpointMap[pathname] || [])
		}
		link.addEventListener("pointerenter", prewarm, { passive: true })
		link.addEventListener("focus", prewarm)
	})
}

export function bootFinancialExperience(): void {
	prewarmCurrentFinancialPage()
	wireFinancialNavigationPrewarm()
	void bootFinancialPage()
}
