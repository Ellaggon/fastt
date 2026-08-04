import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration phase 6 cleanup", () => {
	it("publishes only integrations with complete provider workflows", () => {
		const catalog = read("src/pages/provider/settings/integrations/catalog.astro")
		const domain = read("src/lib/provider-integrations.ts")

		expect(catalog).toContain('key: "channel_manager"')
		expect(catalog).toContain('key: "external_calendars"')
		expect(catalog).not.toContain('key: "webhooks_api"')
		expect(catalog).not.toContain('key: "accounting_export"')
		expect(catalog).not.toContain("Webhooks y API")
		expect(catalog).not.toContain("Exportación contable")
		expect(domain).toContain("providerIntegrationWorkspaceConnectorKeys")
		expect(domain).toContain("historical data and audit compatibility")
	})

	it("retires the generic manager without breaking old bookmarks", () => {
		const manage = read("src/pages/provider/settings/integrations/manage.astro")
		const redirects = read("src/lib/provider-integration-redirects.ts")

		expect(manage).toContain("providerSettingsIntegrationsConnections")
		expect(manage).toContain("Astro.redirect")
		expect(manage).not.toContain("<form")
		expect(manage).not.toContain("endpointUrl")
		expect(manage).not.toContain("credentialSecret")
		expect(manage).not.toContain("data-connector-scopes")
		expect(redirects).not.toContain('"/provider/settings/integrations/manage"')
	})

	it("keeps retired connectors out of provider metrics, health and activity", () => {
		const summary = read("src/pages/provider/settings/integrations.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")
		const detail = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const incidents = read("src/pages/provider/settings/integrations/incidents.astro")
		const activity = read("src/pages/api/provider/integrations/operations/activity.ts")
		const readModels = read("src/lib/provider-integration-read-models.ts")
		const operations = read("src/lib/provider-integration-operations.ts")

		expect(summary).toContain("getProviderIntegrationsSummaryReadModel")
		expect(connections).toContain("getProviderIntegrationsConnectionsReadModel")
		expect(readModels).toContain('["channel_manager", "external_calendars"]')
		expect(detail).toContain("isProviderIntegrationWorkspaceConnector")
		expect(incidents).toContain("listProviderWorkspaceIntegrationIncidents")
		expect(operations).toContain("providerIntegrationIncidentBaseFilter")
		expect(operations).toContain("WORKSPACE_CONNECTOR_KEYS")
		expect(activity).toContain("isProviderIntegrationWorkspaceConnector")
	})

	it("blocks generic connector creation and preserves safe historical data", () => {
		const connect = read("src/pages/api/provider/integrations/[connectorKey]/connect.ts")
		const domain = read("src/lib/provider-integrations.ts")

		expect(connect).toContain('params.connectorKey !== "channel_manager"')
		expect(connect).toContain("CONNECTOR_NOT_AVAILABLE")
		expect(domain).toContain('| "webhooks_api"')
		expect(domain).toContain('| "accounting_export"')
	})

	it("uses human labels and removes duplicate empty health panels", () => {
		const detail = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const diagnostics = read(
			"src/components/provider/integrations/IntegrationDiagnosticsPanel.astro"
		)
		const emptyState = read("src/components/provider/integrations/IntegrationEmptyState.astro")

		expect(detail).toContain("permissionLabel")
		expect(detail).toContain("IntegrationDiagnosticsPanel")
		expect(diagnostics).toContain("Autorización")
		expect(diagnostics).toContain("Incidencias abiertas")
		expect(detail).not.toContain("No hay problemas abiertos en esta conexión")
		expect(emptyState).not.toContain("Podrás revisar qué controla cada sistema")
	})
})
