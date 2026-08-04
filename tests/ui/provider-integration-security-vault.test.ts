import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider integration security phase 6", () => {
	it("persists OAuth tokens through the encrypted credential vault", () => {
		const oauth = read("src/lib/provider-connector-oauth.ts")
		const callback = read("src/pages/api/provider/integrations/oauth/callback.ts")
		const domain = read("src/lib/provider-integrations.ts")
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")

		expect(oauth).toContain("accessToken")
		expect(oauth).toContain("refreshConnectorOAuthToken")
		expect(callback).toContain("oauthCredential")
		expect(domain).toContain("encryptProviderIntegrationSecret")
		expect(domain).toContain("decryptProviderIntegrationSecret")
		expect(domain).toContain("ensureProviderIntegrationCredentialFresh")
		expect(domain).toContain("provider.integration.credential_refresh")
		expect(schema).toContain('scopesJson: jsonb("scopesJson")')
		expect(schema).toContain('refreshAfterAt: ts("refreshAfterAt")')
		expect(schema).toContain('lastRefreshedAt: ts("lastRefreshedAt")')
		expect(schema).toContain('revokedAt: ts("revokedAt")')
	})

	it("requires granular integration permission on mutation APIs", () => {
		const apis = [
			"src/pages/api/provider/integrations/[connectorKey]/connect.ts",
			"src/pages/api/provider/integrations/[connectorKey]/sync.ts",
			"src/pages/api/provider/integrations/[connectorKey]/revoke.ts",
			"src/pages/api/provider/integrations/[connectorKey]/oauth/start.ts",
			"src/pages/api/provider/integrations/operations/mappings.ts",
			"src/pages/api/provider/integrations/operations/connections/[connectionId]/primary.ts",
			"src/pages/api/provider/integrations/operations/incidents/[incidentId]/resolve.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/index.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/[calendarId]/sync.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/[calendarId]/revoke.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/sync-all.ts",
			"src/pages/api/provider/integrations/external-calendars/exports/index.ts",
			"src/pages/api/provider/integrations/external-calendars/exports/[exportId]/revoke.ts",
			"src/pages/api/provider/integrations/external-calendars/conflicts/[conflictId]/resolve.ts",
		]
		for (const api of apis) {
			expect(read(api), api).toContain("requireProviderIntegrationManager")
		}
		expect(read("src/pages/api/provider/integrations/oauth/callback.ts")).toContain(
			"permissions.canManageIntegrations"
		)
	})

	it("requires explicit disconnect confirmation and keeps secrets out of UI copy", () => {
		const page = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)
		const revoke = read("src/pages/api/provider/integrations/[connectorKey]/revoke.ts")
		const audit = read("src/lib/provider-audit.ts")

		expect(page).toContain("data-disconnect-confirmation")
		expect(page).toContain("confirmDisconnect")
		expect(page).toContain("DESCONECTAR")
		expect(page).toContain("El historial permanecerá disponible")
		expect(page).not.toContain("encryptedJson")
		expect(revoke).toContain('confirmDisconnect") ?? "") !== "DESCONECTAR"')
		expect(audit).toContain('"accessToken"')
		expect(audit).toContain('"refreshToken"')
		expect(audit).toContain('"encryptedJson"')
	})

	it("bootstraps Channex staging through the canonical encrypted vault", () => {
		const script = read("src/scripts/bootstrap-channex-staging.ts")
		const pkg = read("package.json")

		expect(pkg).toContain('"bootstrap:channex-staging"')
		expect(script).toContain('requiredEnv("CHANNEX_STAGING_API_KEY")')
		expect(script).toContain("connectProviderIntegration")
		expect(script).toContain("decryptProviderIntegrationSecret")
		expect(script).toContain("vaultVerified: true")
		expect(script).not.toContain("console.log(apiKey)")
	})
})
