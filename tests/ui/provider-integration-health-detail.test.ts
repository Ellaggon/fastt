import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration detail and health", () => {
	it("provides a real connection detail with health, mapping and incidents", () => {
		const detail = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")
		const summary = read("src/pages/provider/settings/integrations.astro")

		expect(detail).toContain("getProviderIntegrationConnectionReadModel")
		expect(detail).toContain("data-integration-connection-health")
		expect(detail).toContain("Estado y alcance")
		expect(detail).toContain("IntegrationDiagnosticsPanel")
		expect(detail).toContain("IntegrationExecutionPanel")
		expect(detail).not.toContain("getProviderIntegrationConnectionOverview")
		expect(detail).not.toContain("Astro.redirect(routes.providerSettingsIntegrationMapping")
		expect(connections).toContain("providerSettingsIntegrationConnection(params.connectionId)")
		expect(summary).toContain("providerSettingsIntegrationConnection(connector.connectionId)")
	})

	it("separates actionable incidents from execution history", () => {
		const incidents = read("src/pages/provider/settings/integrations/incidents.astro")
		const activity = read("src/pages/provider/settings/integrations/activity.astro")
		const subnav = read("src/components/provider/integrations/ProviderIntegrationsSubnav.astro")

		expect(incidents).toContain("listProviderIntegrationIncidents")
		expect(incidents).toContain('label: "Abiertas"')
		expect(incidents).toContain('label: "Resueltas"')
		expect(incidents).toContain("Marcar resuelta")
		expect(incidents).toContain('name="returnTo"')
		expect(activity).toContain("IntegrationExecutionPanel")
		expect(activity).not.toContain("listProviderIntegrationOperations")
		expect(subnav).toContain("providerSettingsIntegrationsIncidents")
		expect(subnav).toContain('label: "Historial"')
	})

	it("loads runs and jobs only after an explicit user action", () => {
		const panel = read("src/components/provider/integrations/IntegrationExecutionPanel.astro")
		const activityPage = read("src/pages/provider/settings/integrations/activity.astro")
		const detailPage = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const endpoint = read("src/pages/api/provider/integrations/operations/activity.ts")
		const operations = read("src/lib/provider-integration-operations.ts")

		expect(panel).toContain("data-load-integration-activity")
		expect(panel).toContain('button.addEventListener("click"')
		expect(panel).toContain("/api/provider/integrations/operations/activity")
		expect(panel).toContain("Cargar historial")
		expect(activityPage).not.toContain("ProviderIntegrationSyncRun")
		expect(activityPage).not.toContain("ProviderIntegrationSyncJob")
		expect(detailPage).not.toContain("listProviderIntegrationExecutionActivity")
		expect(endpoint).toContain("listProviderIntegrationExecutionActivity")
		expect(endpoint).toContain('"Cache-Control": "private, no-store"')
		expect(operations).toContain("export async function listProviderIntegrationExecutionActivity")
	})

	it("does not query recent activity in regular integration listings", () => {
		const domain = read("src/lib/provider-integrations.ts")
		const summary = read("src/pages/provider/settings/integrations.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")
		const manage = read("src/pages/provider/settings/integrations/manage.astro")

		expect(domain).toContain("includeRecentActivity?: boolean")
		expect(domain).toContain("params.includeRecentActivity")
		expect(summary).not.toContain("includeRecentActivity: true")
		expect(connections).not.toContain("includeRecentActivity: true")
		expect(manage).not.toContain("includeRecentActivity")
		expect(manage).toContain("providerSettingsIntegrationsConnections")
	})

	it("preserves a safe incident return path after resolution", () => {
		const endpoint = read(
			"src/pages/api/provider/integrations/operations/incidents/[incidentId]/resolve.ts"
		)

		expect(endpoint).toContain("safeIntegrationReturnTo")
		expect(endpoint).toContain('form?.get("returnTo")')
		expect(endpoint).toContain("providerSettingsIntegrationsIncidents")
	})
})
