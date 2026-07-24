import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import { recommendedProviderConnectorKeys } from "@/lib/provider-integrations"

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
		expect(recommendedProviderConnectorKeys).toEqual(["payment_gateway", "channel_manager"])
	})

	it("wires Simple mode recommended connectors and mapped error notices", () => {
		const page = read("src/pages/provider/settings/integrations.astro")
		const visible = visibleCopy(page)
		const errors = read("src/lib/provider-integration-errors.ts")
		const connect = read("src/pages/api/provider/integrations/[connectorKey]/connect.ts")

		expect(page).toContain('uiMode === "simple"')
		expect(page).toContain("isRecommendedProviderConnector")
		expect(page).toContain("mapProviderIntegrationError")
		expect(page).toContain("Probar conexión")
		expect(page).toContain("Modo Simple · recomendados")
		expect(page).toContain('mode=pro')
		expect(visible).toContain("Recomendado")
		expect(visible).not.toContain("vault://")
		expect(visible).not.toContain("smoke test")
		expect(visible).not.toContain("Smoke test")

		expect(errors).toContain("mapProviderIntegrationError")
		expect(errors).toContain("vault://")
		expect(connect).toContain("redirectIntegrationsSuccess")
		expect(connect).toContain("resolveIntegrationUiMode")
	})
})
