import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { fetchChannelManagerRemoteProperties } from "@/lib/provider-channel-manager-properties"
import { createConnectorOAuthState, parseConnectorOAuthState } from "@/lib/provider-connector-oauth"
import { safeIntegrationReturnTo } from "@/lib/provider-integration-redirects"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration catalog and channel manager wizard", () => {
	it("keeps discovery separate from credential and operational forms", () => {
		const catalog = read("src/pages/provider/settings/integrations/catalog.astro")
		const wizard = read("src/pages/provider/settings/integrations/connect/channel-manager.astro")
		const manage = read("src/pages/provider/settings/integrations/manage.astro")

		expect(catalog).toContain("data-integration-catalog")
		expect(catalog).toContain("data-catalog-connector={item.key}")
		expect(catalog).toContain("Conectar channel manager")
		expect(catalog).not.toContain('name="credentialSecret"')
		expect(catalog).not.toContain("data-integration-mapping-builder")
		expect(manage).toContain("providerSettingsIntegrationsConnections")
		expect(manage).not.toContain("<form")
		expect(wizard).toContain('data-channel-wizard-step="provider"')
		expect(wizard).toContain('data-channel-wizard-step="access"')
		expect(wizard).toContain('data-channel-wizard-step="property"')
		expect(wizard).toContain('data-channel-wizard-step="review"')
		expect(wizard).toContain("data-channel-wizard-steps")
		expect(wizard).toContain("data-remote-property-picker")
		expect(wizard).toContain('autocomplete="new-password"')
		expect(wizard).not.toMatch(/searchParams\.set\(\s*["'](?:credential|secret|token)/i)
	})

	it("allows only local, non-sensitive wizard return paths", () => {
		const request = new Request("https://fastt.example/provider/settings/integrations/catalog")
		expect(
			safeIntegrationReturnTo(
				request,
				"/provider/settings/integrations/connect/channel-manager?step=property&vendor=cloudbeds"
			)?.pathname
		).toBe("/provider/settings/integrations/connect/channel-manager")
		expect(safeIntegrationReturnTo(request, "https://evil.example/steal")).toBeNull()
		expect(
			safeIntegrationReturnTo(
				request,
				"/provider/settings/integrations/connect/channel-manager?secret=raw"
			)
		).toBeNull()
		expect(
			safeIntegrationReturnTo(
				request,
				"/provider/settings/integrations/connect/channel-manager?access_token=raw"
			)
		).toBeNull()
	})

	it("signs safe wizard context into OAuth state without raw credentials", () => {
		const state = createConnectorOAuthState({
			providerId: "provider_test",
			connectorKey: "channel_manager",
			actorUserId: "user_test",
			uiMode: "pro",
			mode: "sandbox",
			vendorKey: "cloudbeds",
			returnTo:
				"/provider/settings/integrations/connect/channel-manager?step=property&vendor=cloudbeds",
		})
		const parsed = parseConnectorOAuthState(state)
		expect(parsed?.vendorKey).toBe("cloudbeds")
		expect(parsed?.returnTo).toContain("step=property")
		expect(state).not.toContain("credential")
		expect(state).not.toContain("access_token")
	})

	it("normalizes remote properties without returning authentication material", async () => {
		const cloudbeds = await fetchChannelManagerRemoteProperties({
			vendorKey: "cloudbeds",
			authType: "api_key",
			credentialSecret: "test://cloudbeds-ok",
			mode: "sandbox",
		})
		const channex = await fetchChannelManagerRemoteProperties({
			vendorKey: "channex",
			authType: "api_key",
			credentialSecret: "test://channex-ok",
			mode: "sandbox",
		})
		expect(cloudbeds.properties[0]).toMatchObject({
			id: "cloudbeds_property_1",
			name: "Hotel de prueba Cloudbeds",
		})
		expect(channex.properties[0]).toMatchObject({
			id: "channex_property_1",
			name: "Hotel de prueba Channex",
		})
		expect(JSON.stringify({ cloudbeds, channex })).not.toContain("test://")
	})

	it("protects the remote-property endpoint and disables response caching", () => {
		const endpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/properties.ts"
		)
		const domain = read("src/lib/provider-integrations.ts")
		const connect = read("src/pages/api/provider/integrations/[connectorKey]/connect.ts")

		expect(endpoint).toContain("requireProviderIntegrationManager")
		expect(endpoint).toContain("listProviderChannelManagerRemoteProperties")
		expect(endpoint).toContain('"Cache-Control": "private, no-store"')
		expect(domain).toContain("ensureProviderIntegrationCredentialFresh")
		expect(domain).toContain("fetchChannelManagerRemoteProperties")
		expect(connect).toContain('form.get("credentialSecret")')
		expect(connect).toContain("returnTo")
		expect(connect).toContain("params: { connectionId }")
	})
})
