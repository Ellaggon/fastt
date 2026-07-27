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

describe("S2-2 integrations Simple: recommended + mapped errors", () => {
	it("maps raw connector errors to host-facing copy without jargon", () => {
		expect(mapProviderIntegrationError("CONNECTION_NOT_FOUND")).toContain("No encontramos")
		expect(mapProviderIntegrationError("No hay credentialsRef para probar.")).toContain(
			"enlace https"
		)
		expect(
			mapProviderIntegrationError("credentialsRef debe ser https://… o vault://…")
		).not.toContain("vault://")
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
				credentialsRef: "https://payments.example.test",
			})
		).rejects.toThrow("CONNECTOR_NOT_FOUND")
	})

	it("wires Simple mode recommended connectors and mapped error notices", () => {
		const page = read("src/pages/provider/settings/integrations.astro")
		const visible = visibleCopy(page)
		const errors = read("src/lib/provider-integration-errors.ts")
		const domain = read("src/lib/provider-integrations.ts")
		const vendors = read("src/lib/provider-channel-manager-vendors.ts")
		const vendorSmoke = read("src/lib/provider-channel-manager-smoke.ts")
		const connect = read("src/pages/api/provider/integrations/[connectorKey]/connect.ts")
		const sync = read("src/pages/api/provider/integrations/[connectorKey]/sync.ts")

		expect(page).toContain('uiMode === "simple"')
		expect(page).toContain("isRecommendedProviderConnector")
		expect(page).toContain("mapProviderIntegrationError")
		expect(page).toContain("Probar conexión")
		expect(page).toContain("Modo Simple · recomendado")
		expect(page).toContain("data-integrations-honest-summary")
		expect(page).toContain("data-external-calendars-mvp")
		expect(page).toContain("data-external-calendar-list")
		expect(page).toContain("Agregar y actualizar")
		expect(page).toContain("Actualizar todos")
		expect(page).toContain("Actualización automática")
		expect(page).toContain("Próxima actualización programada")
		expect(page).toContain("Posibles conflictos")
		expect(page).toContain("listProviderExternalCalendars")
		expect(page).toContain("canRevoke(connector)")
		expect(page).toContain("data-channel-manager-vendor-picker")
		expect(page).toContain('name="vendorKey"')
		expect(page).toContain('name="authType"')
		expect(page).toContain('name="externalPropertyId"')
		expect(sync).toContain('result.status === "connected" ? "sync_tested" : "reference_checked"')
		expect(page).toContain('mode=pro')
		expect(visible).toContain("Recomendado")
		expect(visible).toContain("Estado de conexión")
		expect(visible).not.toContain("Conectados")
		expect(visible).not.toContain("Pendientes de prueba")
		expect(visible).not.toContain("Última sync")
		expect(visible).not.toContain("Pasarela de pago")
		expect(visible).not.toContain("Autoriza cobros")
		expect(visible).not.toContain("vault://")
		expect(visible).not.toContain("smoke test")
		expect(visible).not.toContain("Smoke test")

		expect(errors).toContain("mapProviderIntegrationError")
		expect(errors).toContain("vault://")
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
