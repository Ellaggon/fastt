import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

import {
	checkTinBureauMatch,
	getTinBureauStatus,
	resolveTinBureauPreference,
} from "@/lib/tin-bureau"
import {
	buildConnectorOAuthAuthorizeUrl,
	getConnectorOAuthStatus,
} from "@/lib/provider-connector-oauth"
import {
	emitProviderSettingsFunnelEvent,
	resolveSettingsFunnelSink,
	SETTINGS_FUNNEL_EVENTS,
} from "@/lib/provider-settings-funnel"
import { logger } from "@/lib/observability/logger"
import { getPayoutRailStatus } from "@/lib/payout-rail"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S7-1 ACH live rail gating", () => {
	afterEach(() => {
		delete process.env.PAYOUT_RAIL_PROVIDER
		delete process.env.STRIPE_SECRET_KEY
		delete process.env.PAYOUT_RAIL_LIVE
		delete process.env.PAYOUT_RAIL_VERIFICATION
	})

	it("reports live mode only with stripe_connect + key + PAYOUT_RAIL_LIVE", () => {
		process.env.PAYOUT_RAIL_PROVIDER = "stripe_connect"
		process.env.STRIPE_SECRET_KEY = "sk_test"
		process.env.PAYOUT_RAIL_LIVE = "1"
		const status = getPayoutRailStatus()
		expect(status.mode).toBe("live")
		expect(status.activeProvider).toBe("stripe_connect")
		expect(status.hostLabel).toMatch(/ACH|Financial Connections/i)
	})

	it("cables Stripe SetupIntent + FC + verify_microdeposits", () => {
		const stripe = read("src/lib/payout-rail/stripeConnect.ts")
		expect(stripe).toContain("isStripePayoutRailLiveEnabled")
		expect(stripe).toContain("resolveStripeAchVerificationMethod")
		expect(stripe).toContain("api.stripe.com")
		expect(stripe).toContain("/v1/setup_intents")
		expect(stripe).toContain("verify_microdeposits")
		expect(stripe).toContain("financial_connections/sessions")
		expect(stripe).toContain("confirmStripeConnectMicroDeposit")
		expect(read(".env.example")).toContain("PAYOUT_RAIL_VERIFICATION")
	})
})

describe("S7-2 OAuth + docs-lite Simple", () => {
	afterEach(() => {
		delete process.env.CONNECTOR_AUTH_PROVIDER
		delete process.env.CONNECTOR_OAUTH_CLIENT_ID
		delete process.env.CONNECTOR_OAUTH_CLIENT_SECRET
		delete process.env.CONNECTOR_OAUTH_AUTHORIZE_URL
		delete process.env.CONNECTOR_OAUTH_TOKEN_URL
		delete process.env.CONNECTOR_OAUTH_LIVE
	})

	it("exposes docs-lite in Simple mode and OAuth start/callback", () => {
		const integrations = read("src/pages/provider/settings/integrations.astro")
		const callback = read("src/pages/api/provider/integrations/oauth/callback.ts")
		const oauth = read("src/lib/provider-connector-oauth.ts")

		expect(integrations).toContain("data-connector-docs-lite")
		expect(integrations).not.toContain("{!isSimple ? (\n\t\t\t\t\t\t\t<details class=\"rounded-lg border border-slate-200 bg-white p-3\" data-connector-docs-lite>")
		expect(callback).toContain("getConnectorOAuthStatus")
		expect(callback).toContain("exchangeConnectorOAuthCode")
		expect(oauth).toContain("buildConnectorOAuthAuthorizeUrl")
		expect(oauth).toContain("isConnectorOAuthLiveEnabled")
		expect(read(".env.example")).toContain("CONNECTOR_AUTH_PROVIDER")
		expect(read(".env.example")).toContain("CONNECTOR_OAUTH_LIVE")
	})

	it("builds authorize URL only when oauth scaffold/live is configured", () => {
		expect(getConnectorOAuthStatus().mode).toBe("credentials_ref")
		expect(
			buildConnectorOAuthAuthorizeUrl({
				connectorKey: "channel_manager",
				providerId: "p1",
				redirectUri: "https://app.test/callback",
				state: "abc",
			})
		).toBeNull()

		process.env.CONNECTOR_AUTH_PROVIDER = "oauth2"
		process.env.CONNECTOR_OAUTH_CLIENT_ID = "cid"
		process.env.CONNECTOR_OAUTH_CLIENT_SECRET = "sec"
		process.env.CONNECTOR_OAUTH_AUTHORIZE_URL = "https://vendor.test/oauth/authorize"
		expect(getConnectorOAuthStatus().mode).toBe("oauth_scaffold")
		const url = buildConnectorOAuthAuthorizeUrl({
			connectorKey: "channel_manager",
			providerId: "p1",
			redirectUri: "https://app.test/callback",
			state: "abc",
			scopes: ["read"],
		})
		expect(url).toContain("https://vendor.test/oauth/authorize")
		expect(url).toContain("client_id=cid")
		expect(url).toContain("connector=channel_manager")
	})
})

describe("S7-3 TIN bureau adapter", () => {
	afterEach(() => {
		delete process.env.TIN_BUREAU_PROVIDER
		delete process.env.TIN_BUREAU_API_KEY
		delete process.env.TIN_BUREAU_API_URL
		delete process.env.TIN_BUREAU_LIVE
	})

	it("defaults to format_only and simulates match harness with narratives", async () => {
		expect(resolveTinBureauPreference()).toBe("format_only")
		expect(getTinBureauStatus().mode).toBe("format_only")

		process.env.TIN_BUREAU_PROVIDER = "simulated"
		const match = await checkTinBureauMatch({
			providerId: "p1",
			country: "BO",
			taxpayerId: "1234567",
			legalName: "Acme",
		})
		expect(match.matchStatus).toBe("match")
		expect(match.hostNarrative).toBeTruthy()

		const mismatch = await checkTinBureauMatch({
			providerId: "p1",
			country: "BO",
			taxpayerId: "1234500",
			legalName: "Acme",
		})
		expect(mismatch.matchStatus).toBe("mismatch")
	})

	it("persists tinBureau narratives on tax upsert path", () => {
		const tax = read("src/lib/provider-tax-configuration.ts")
		expect(tax).toContain("checkTinBureauMatch")
		expect(tax).toContain("tinBureau:")
		expect(tax).toContain("hostNarrative")
		expect(read(".env.example")).toContain("TIN_BUREAU_PROVIDER")
		expect(read(".env.example")).toContain("TIN_BUREAU_LIVE")
	})
})

describe("S7-4 Funnel productized sink", () => {
	const prev = process.env.SETTINGS_FUNNEL_SINK

	afterEach(() => {
		if (prev === undefined) delete process.env.SETTINGS_FUNNEL_SINK
		else process.env.SETTINGS_FUNNEL_SINK = prev
		vi.restoreAllMocks()
	})

	it("resolves db/both sinks and keeps log path", () => {
		process.env.SETTINGS_FUNNEL_SINK = "db"
		expect(resolveSettingsFunnelSink()).toBe("db")
		process.env.SETTINGS_FUNNEL_SINK = "both"
		expect(resolveSettingsFunnelSink()).toBe("both")

		const spy = vi.spyOn(logger, "info").mockImplementation(() => {})
		process.env.SETTINGS_FUNNEL_SINK = "both"
		const result = emitProviderSettingsFunnelEvent({
			event: SETTINGS_FUNNEL_EVENTS.blockerShown,
			providerId: "prov_1",
			domain: "payments",
			surface: "hub_coach",
		})
		expect(result.ok).toBe(true)
		expect(result.sink).toBe("both")
		expect(spy).toHaveBeenCalled()
	})

	it("documents query helpers, admin API, and env", () => {
		const helper = read("src/lib/provider-settings-funnel.ts")
		const adminApi = read("src/pages/api/admin/providers/settings-funnel.ts")
		const adminPage = read("src/pages/admin/providers.astro")
		const envExample = read(".env.example")
		expect(helper).toContain("listProviderSettingsFunnelEvents")
		expect(helper).toContain("summarizeProviderSettingsFunnel")
		expect(helper).toContain("summarizeProviderSettingsFunnelByDomain")
		expect(helper).toContain("getSettingsFunnelQueryStatus")
		expect(helper).toContain('FUNNEL_ENTITY_TYPE = "SettingsFunnel"')
		expect(adminApi).toContain("summarizeProviderSettingsFunnelByDomain")
		expect(adminPage).toContain("data-admin-settings-funnel")
		expect(envExample).toContain("SETTINGS_FUNNEL_SINK=db")
		expect(envExample).toContain("SETTINGS_FUNNEL_SINK=both")
		expect(envExample).toContain("/api/admin/providers/settings-funnel")
	})
})
