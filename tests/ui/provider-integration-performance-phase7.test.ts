import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integrations performance phase 7", () => {
	it("uses page-specific read models instead of the integration aggregate", () => {
		const pages = [
			"src/pages/provider/settings/integrations.astro",
			"src/pages/provider/settings/integrations/catalog.astro",
			"src/pages/provider/settings/integrations/connections/index.astro",
			"src/pages/provider/settings/integrations/connect/channel-manager.astro",
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro",
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro",
		].map(read)

		for (const page of pages) {
			expect(page).not.toContain("listProviderIntegrations")
			expect(page).not.toContain("listProviderExternalCalendars")
		}
		expect(read("src/lib/provider-integration-read-models.ts")).toContain("Promise.all")
	})

	it("loads diagnostics privately and only after user intent", () => {
		const detail = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const panel = read("src/components/provider/integrations/IntegrationDiagnosticsPanel.astro")
		const endpoint = read("src/pages/api/provider/integrations/operations/diagnostics.ts")

		expect(detail).toContain("IntegrationDiagnosticsPanel")
		expect(detail).not.toContain("getProviderIntegrationConnectionDiagnostics")
		expect(panel).toContain('button.addEventListener("click"')
		expect(panel).toContain("/api/provider/integrations/operations/diagnostics")
		expect(endpoint).toContain('"Cache-Control": "private, no-store"')
	})

	it("paginates execution history and mapping rows", () => {
		const activity = read("src/lib/provider-integration-operations.ts")
		const activityPanel = read(
			"src/components/provider/integrations/IntegrationExecutionPanel.astro"
		)
		const mappingEndpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/mapping-workspace.ts"
		)
		const mappingPage = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)

		expect(activity).toContain(".offset((page - 1) * pageSize)")
		expect(activityPanel).toContain('params.set("page", String(requestedPage))')
		expect(mappingEndpoint).toContain("roomOffset")
		expect(mappingEndpoint).toContain("rateOffset")
		expect(mappingEndpoint).not.toContain("listProviderIntegrationOperations")
		expect(mappingPage).toContain("data-load-more-mappings")
	})

	it("enforces the integration HTML and TTFB budgets", () => {
		const budget = read("scripts/perf/html-budget.mjs")
		const subnav = read("src/components/provider/integrations/ProviderIntegrationsSubnav.astro")

		expect(budget).toContain('path: "/provider/settings/integrations", maxBytes: 100_000')
		expect(budget).toContain("FASTT_HTML_BUDGET_MAX_TTFB_MS")
		expect(budget).toContain("withinTtfbBudget")
		expect(subnav).toContain('data-astro-prefetch="viewport"')
	})
})
