import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import {
	connectProviderIntegration,
	recommendedProviderConnectorKeys,
} from "@/lib/provider-integrations"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function visibleCopy(source: string) {
	return source.replace(/^---[\s\S]*?---\s*/m, "")
}

describe("provider integrations summary navigation", () => {
	it("maps raw connector errors to host-facing copy without jargon", () => {
		expect(mapProviderIntegrationError("CONNECTION_NOT_FOUND")).toContain("No encontramos")
		expect(mapProviderIntegrationError("No hay un endpoint HTTPS para probar.")).toContain(
			"enlace https"
		)
		expect(mapProviderIntegrationError("INTEGRATION_ENDPOINT_INVALID")).toContain("enlace https")
		expect(mapProviderIntegrationError("Smoke HTTPS falló (HTTP 503).")).toContain(
			"servicio respondió"
		)
		expect(mapProviderIntegrationError("Smoke HTTPS OK (HTTP 200) en 12ms.")).toBe(
			"Prueba de conexión correcta."
		)
		expect(recommendedProviderConnectorKeys).toEqual(["channel_manager"])
	})

	it("rejects the retired provider payment gateway connector", async () => {
		await expect(
			connectProviderIntegration({
				providerId: "provider_test",
				currentUserId: "user_test",
				connectorKey: "payment_gateway",
				mode: "sandbox",
				scopes: [],
				endpointUrl: "https://payments.example.test",
			})
		).rejects.toThrow("CONNECTOR_NOT_FOUND")
	})

	it("keeps the summary human and moves configuration behind a dedicated route", () => {
		const summary = read("src/pages/provider/settings/integrations.astro")
		const catalog = read("src/pages/provider/settings/integrations/catalog.astro")
		const manage = read("src/pages/provider/settings/integrations/manage.astro")
		const wizard = read("src/pages/provider/settings/integrations/connect/channel-manager.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")
		const visible = visibleCopy(summary)
		const errors = read("src/lib/provider-integration-errors.ts")
		const domain = read("src/lib/provider-integrations.ts")
		const vendors = read("src/lib/provider-channel-manager-vendors.ts")
		const vendorSmoke = read("src/lib/provider-channel-manager-smoke.ts")
		const routes = read("src/lib/routes.ts")
		const settingsSubnav = read("src/components/provider/ProviderSettingsSubnav.astro")
		const integrationsSubnav = read(
			"src/components/provider/integrations/ProviderIntegrationsSubnav.astro"
		)
		const integrationsLayout = read("src/layouts/ProviderIntegrationsLayout.astro")
		const redirects = read("src/lib/provider-integration-redirects.ts")
		const connectionRoute = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const mappingRoute = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)
		const activityRoute = read("src/pages/provider/settings/integrations/activity.astro")
		const calendarRoute = read("src/pages/rates/calendar/connections.astro")
		const connect = read("src/pages/api/provider/integrations/[connectorKey]/connect.ts")
		const sync = read("src/pages/api/provider/integrations/[connectorKey]/sync.ts")

		expect(summary).toContain("IntegrationStatusRow")
		expect(summary).toContain("IntegrationEmptyState")
		expect(summary).toContain("IntegrationNextAction")
		expect(summary).toContain("ProviderIntegrationsLayout")
		expect(summary).not.toContain("ProviderSettingsLayout")
		expect(summary).toContain("data-integration-status-list")
		expect(summary).toContain('legacyMode === "simple" || legacyMode === "pro"')
		expect(summary).toContain("providerSettingsIntegrationsCatalog")
		expect(visible).toContain("Conectar servicio")
		expect(visible).toContain("Tus conexiones")
		expect(visible).toContain("channel manager")
		expect(visible).toContain("calendarios")
		expect(visible).not.toContain("Modo Simple")
		expect(visible).not.toContain("Modo Pro")
		expect(visible).not.toContain("API key")
		expect(visible).not.toContain("OAuth")
		expect(visible).not.toContain("Sandbox")

		expect(catalog).toContain("data-integration-catalog")
		expect(catalog).toContain("Conectar channel manager")
		expect(catalog).toContain("Calendarios externos")
		expect(catalog).toContain("ProviderIntegrationsLayout")
		expect(catalog).not.toContain("ProviderSettingsLayout")
		expect(catalog).not.toContain('name="credentialSecret"')
		expect(manage).toContain("providerSettingsIntegrationsConnections")
		expect(manage).not.toContain("<form")
		expect(manage).not.toContain("data-external-calendars-mvp")
		expect(manage).not.toContain("listProviderExternalCalendars")
		expect(wizard).toContain("selectableVendors")
		expect(wizard).toContain('data-channel-wizard-step="provider"')
		expect(wizard).toContain('name="vendorKey"')
		expect(wizard).toContain('name="authType"')
		expect(wizard).toContain('name="externalPropertyId"')
		expect(sync).toContain('result.status === "connected" ? "sync_tested" : "reference_checked"')
		expect(routes).toContain("providerSettingsIntegrationsCatalog")
		expect(routes).toContain("providerSettingsIntegrationsManage")
		expect(routes).toContain("providerSettingsIntegrationsConnections")
		expect(routes).toContain("providerSettingsIntegrationConnection")
		expect(routes).toContain("providerSettingsIntegrationMapping")
		expect(routes).toContain("providerSettingsIntegrationsIncidents")
		expect(routes).toContain("providerSettingsIntegrationsActivity")
		expect(connectionRoute).toContain("data-integration-connection-health")
		expect(connectionRoute).toContain("getProviderIntegrationConnectionReadModel")
		expect(connectionRoute).toContain("IntegrationDiagnosticsPanel")
		expect(mappingRoute).toContain("data-mapping-workspace")
		expect(mappingRoute).toContain("data-mapping-preview")
		expect(activityRoute).toContain("IntegrationExecutionPanel")
		expect(activityRoute).toContain("Carga bajo demanda")
		expect(calendarRoute).toContain("data-calendar-connections-workspace")
		expect(calendarRoute).toContain("data-external-calendars-mvp")
		expect(calendarRoute).toContain("Actualizar todos")
		expect(connections).toContain("data-integration-connections-list")
		expect(settingsSubnav).not.toContain('label: "Integraciones"')
		expect(integrationsSubnav).toContain('label: "Resumen"')
		expect(integrationsSubnav).toContain('label: "Conexiones"')
		expect(integrationsSubnav).toContain('label: "Incidencias"')
		expect(integrationsSubnav).toContain('label: "Historial"')
		expect(integrationsSubnav).not.toContain('label: "Catálogo"')
		expect(integrationsLayout).toContain("ProviderIntegrationsSubnav")
		expect(integrationsLayout).not.toContain("ProviderSettingsSubnav")
		expect(redirects).toContain('uiMode === "pro"')
		expect(redirects).toContain('"/provider/settings/integrations/connections"')
		expect(visible).not.toContain("Conectados")
		expect(visible).not.toContain("Pendientes de prueba")
		expect(visible).not.toContain("Última sync")
		expect(visible).not.toContain("Pasarela de pago")
		expect(visible).not.toContain("Autoriza cobros")
		expect(visible).not.toContain("vault://")
		expect(visible).not.toContain("smoke test")
		expect(visible).not.toContain("Smoke test")

		expect(errors).toContain("mapProviderIntegrationError")
		expect(errors).not.toContain("credentialsRef")
		expect(domain).toContain("Validado por prueba")
		expect(domain).toContain("reference_valid")
		expect(domain).toContain("vendorKey")
		expect(domain).toContain("runChannelManagerVendorSmokeTest")
		expect(vendors).toContain("cloudbeds")
		expect(vendors).toContain("channex")
		expect(vendorSmoke).toContain("getHotels")
		expect(vendorSmoke).toContain("user-api-key")
		expect(domain).toContain('defaultScopes: ["calendar:import"]')
		expect(domain).not.toContain('"calendar:export"')
		expect(connect).toContain("redirectIntegrationsSuccess")
		expect(connect).toContain("resolveIntegrationUiMode")
	})
})
