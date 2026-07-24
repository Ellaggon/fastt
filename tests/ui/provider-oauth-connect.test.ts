import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildConnectorOAuthAuthorizeUrl,
	buildConnectorOAuthCredentialsRef,
	createConnectorOAuthState,
	exchangeConnectorOAuthCode,
	getConnectorOAuthStatus,
	parseConnectorOAuthState,
} from "@/lib/provider-connector-oauth"
import { runConnectorSmokeTest } from "@/lib/provider-connector-smoke"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

const envKeys = [
	"CONNECTOR_AUTH_PROVIDER",
	"CONNECTOR_OAUTH_CLIENT_ID",
	"CONNECTOR_OAUTH_CLIENT_SECRET",
	"CONNECTOR_OAUTH_AUTHORIZE_URL",
	"CONNECTOR_OAUTH_TOKEN_URL",
	"CONNECTOR_OAUTH_LIVE",
	"CONNECTOR_OAUTH_STATE_SECRET",
] as const

describe("P2 OAuth-grade connect + docs-lite Simple", () => {
	afterEach(() => {
		for (const key of envKeys) delete process.env[key]
		vi.unstubAllGlobals()
	})

	it("keeps docs-lite available in Simple (not Pro-only)", () => {
		const integrations = read("src/pages/provider/settings/integrations.astro")
		expect(integrations).toContain("data-connector-docs-lite")
		expect(integrations).toContain("data-connector-oauth-start")
		expect(integrations).not.toContain(
			"{!isSimple ? (\n\t\t\t\t\t\t\t<details class=\"rounded-lg border border-slate-200 bg-white p-3\" data-connector-docs-lite>"
		)
		expect(integrations).toContain("/oauth/start")
		expect(read("src/pages/api/provider/integrations/oauth/callback.ts")).toContain(
			"exchangeConnectorOAuthCode"
		)
		expect(read(".env.example")).toContain("CONNECTOR_OAUTH_LIVE")
		expect(read(".env.example")).toContain("CONNECTOR_OAUTH_TOKEN_URL")
	})

	it("reports oauth_live only with authorize + token + LIVE", () => {
		process.env.CONNECTOR_AUTH_PROVIDER = "oauth2"
		process.env.CONNECTOR_OAUTH_CLIENT_ID = "cid"
		process.env.CONNECTOR_OAUTH_CLIENT_SECRET = "sec"
		process.env.CONNECTOR_OAUTH_AUTHORIZE_URL = "https://vendor.test/oauth/authorize"
		expect(getConnectorOAuthStatus().mode).toBe("oauth_scaffold")

		process.env.CONNECTOR_OAUTH_TOKEN_URL = "https://vendor.test/oauth/token"
		process.env.CONNECTOR_OAUTH_LIVE = "1"
		expect(getConnectorOAuthStatus().mode).toBe("oauth_live")
		expect(getConnectorOAuthStatus().hostLabel).toMatch(/OAuth live/i)
	})

	it("signs and verifies OAuth state", () => {
		process.env.CONNECTOR_OAUTH_STATE_SECRET = "test-secret"
		const state = createConnectorOAuthState({
			providerId: "prov_1",
			connectorKey: "payment_gateway",
			actorUserId: "user_1",
			uiMode: "simple",
			mode: "sandbox",
		})
		const parsed = parseConnectorOAuthState(state)
		expect(parsed?.providerId).toBe("prov_1")
		expect(parsed?.connectorKey).toBe("payment_gateway")
		expect(parseConnectorOAuthState(state + "x")).toBeNull()
	})

	it("exchanges authorization code when oauth_live", async () => {
		process.env.CONNECTOR_AUTH_PROVIDER = "oauth2"
		process.env.CONNECTOR_OAUTH_CLIENT_ID = "cid"
		process.env.CONNECTOR_OAUTH_CLIENT_SECRET = "sec"
		process.env.CONNECTOR_OAUTH_AUTHORIZE_URL = "https://vendor.test/oauth/authorize"
		process.env.CONNECTOR_OAUTH_TOKEN_URL = "https://vendor.test/oauth/token"
		process.env.CONNECTOR_OAUTH_LIVE = "1"

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					access_token: "at_test",
					token_type: "bearer",
					expires_in: 3600,
					scope: "read write",
				}),
			}))
		)

		const result = await exchangeConnectorOAuthCode({
			code: "auth_code",
			redirectUri: "https://app.test/api/provider/integrations/oauth/callback",
			connectorKey: "payment_gateway",
		})
		expect(result.ok).toBe(true)
		expect(result.credentialsRef).toBe(buildConnectorOAuthCredentialsRef("payment_gateway"))
		expect(result.credentialsRef).toBe("oauth2://payment_gateway")
	})

	it("accepts oauth2:// credentials in smoke", async () => {
		const smoke = await runConnectorSmokeTest({
			connectorKey: "payment_gateway",
			credentialsRef: "oauth2://payment_gateway",
			mode: "sandbox",
		})
		expect(smoke.ok).toBe(true)
		expect(smoke.probe).toBe("oauth2")
	})

	it("builds authorize URL in scaffold or live", () => {
		process.env.CONNECTOR_AUTH_PROVIDER = "oauth2"
		process.env.CONNECTOR_OAUTH_CLIENT_ID = "cid"
		process.env.CONNECTOR_OAUTH_CLIENT_SECRET = "sec"
		process.env.CONNECTOR_OAUTH_AUTHORIZE_URL = "https://vendor.test/oauth/authorize"
		const url = buildConnectorOAuthAuthorizeUrl({
			connectorKey: "channel_manager",
			providerId: "p1",
			redirectUri: "https://app.test/callback",
			state: "abc",
			scopes: ["read"],
		})
		expect(url).toContain("client_id=cid")
		expect(url).toContain("connector=channel_manager")
	})
})
