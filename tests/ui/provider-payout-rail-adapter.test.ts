import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

import {
	getPayoutRailStatus,
	initiatePayoutRailMicroDeposit,
	resolvePayoutRailPreference,
} from "@/lib/payout-rail"
import { initiateStripeConnectMicroDeposit } from "@/lib/payout-rail/stripeConnect"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

const envKeys = [
	"PAYOUT_RAIL_PROVIDER",
	"STRIPE_SECRET_KEY",
	"PAYOUT_RAIL_LIVE",
	"PAYOUT_RAIL_VERIFICATION",
] as const
const envSnapshot: Record<string, string | undefined> = {}

function snapshotEnv() {
	for (const key of envKeys) envSnapshot[key] = process.env[key]
}

function restoreEnv() {
	for (const key of envKeys) {
		const value = envSnapshot[key]
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

describe("S5-4 payout rail adapter (ACH/Connect scaffold)", () => {
	afterEach(() => {
		restoreEnv()
	})

	it("defaults to simulated rail without claiming live ACH", () => {
		snapshotEnv()
		delete process.env.PAYOUT_RAIL_PROVIDER
		delete process.env.STRIPE_SECRET_KEY

		expect(resolvePayoutRailPreference()).toBe("simulated")
		const status = getPayoutRailStatus()
		expect(status.mode).toBe("simulated")
		expect(status.activeProvider).toBe("simulated")
		expect(status.hostLabel).toMatch(/simulado/i)
	})

	it("falls back to simulated when stripe_connect is preferred without key", async () => {
		snapshotEnv()
		process.env.PAYOUT_RAIL_PROVIDER = "stripe_connect"
		delete process.env.STRIPE_SECRET_KEY

		const status = getPayoutRailStatus()
		expect(status.mode).toBe("not_configured")
		expect(status.activeProvider).toBe("simulated")

		const stub = await initiateStripeConnectMicroDeposit({
			accountId: "acc_test",
			providerId: "prov_test",
			actorUserId: "user_test",
			currency: "USD",
			accountNumberLast4: "1234",
			country: "BO",
		})
		expect(stub.ok).toBe(false)
		expect(stub.error).toBe("not_configured")

		const initiated = await initiatePayoutRailMicroDeposit({
			accountId: "acc_test",
			providerId: "prov_test",
			actorUserId: "user_test",
			currency: "USD",
			accountNumberLast4: "1234",
			country: "BO",
		})
		expect(initiated.ok).toBe(true)
		expect(initiated.provider).toBe("simulated")
		expect(initiated.fallbackFrom).toBe("stripe_connect")
		expect(initiated.depositAmountsCents).toHaveLength(2)
	})

	it("marks scaffold when Connect key present but PAYOUT_RAIL_LIVE is off", async () => {
		snapshotEnv()
		process.env.PAYOUT_RAIL_PROVIDER = "stripe_connect"
		process.env.STRIPE_SECRET_KEY = "sk_test_scaffold"
		delete process.env.PAYOUT_RAIL_LIVE

		const status = getPayoutRailStatus()
		expect(status.mode).toBe("scaffold")
		expect(status.stripeKeyPresent).toBe(true)
		expect(status.liveEnabled).toBe(false)
		expect(status.activeProvider).toBe("simulated")

		const stub = await initiateStripeConnectMicroDeposit({
			accountId: "acc_test",
			providerId: "prov_test",
			actorUserId: "user_test",
			currency: "USD",
			accountNumberLast4: "1234",
			country: "US",
		})
		expect(stub.ok).toBe(false)
		expect(stub.error).toBe("stripe_connect_live_disabled")

		const initiated = await initiatePayoutRailMicroDeposit({
			accountId: "acc_test",
			providerId: "prov_test",
			actorUserId: "user_test",
			currency: "USD",
			accountNumberLast4: "1234",
			country: "US",
		})
		expect(initiated.ok).toBe(true)
		expect(initiated.provider).toBe("simulated")
		expect(initiated.fallbackFrom).toBe("stripe_connect")
		expect(initiated.mode).toBe("scaffold")
	})

	it("wires initiate through payout rail and honest host/admin labels", () => {
		const accountsLib = read("src/lib/provider-payment-accounts.ts")
		const card = read("src/components/provider/ProviderPaymentAccountsCard.astro")
		const paymentsPage = read("src/pages/provider/settings/payments.astro")
		const admin = read("src/pages/admin/providers.astro")
		const envExample = read(".env.example")

		expect(accountsLib).toContain("initiatePayoutRailMicroDeposit")
		expect(accountsLib).toContain("confirmStripeConnectMicroDeposit")
		expect(accountsLib).toContain("verifyVia")
		expect(accountsLib).toContain("payoutRail:")
		expect(accountsLib).toContain("rail:")

		expect(card).toContain("data-payout-rail-mode")
		expect(card).toContain("data-payout-rail-status")
		expect(card).toContain("getPayoutRailStatus")
		expect(paymentsPage).toContain("payoutRail={payoutRail}")

		expect(admin).toContain("data-admin-payout-rail")
		expect(admin).toContain("Montos de prueba")
		expect(admin).toContain("no salió ACH bancario real")

		expect(envExample).toContain("PAYOUT_RAIL_PROVIDER")
		expect(envExample).toContain("STRIPE_SECRET_KEY")
		expect(envExample).toContain("PAYOUT_RAIL_LIVE")
		expect(envExample).toContain("PAYOUT_RAIL_VERIFICATION")
	})
})

describe("P2 Stripe ACH SetupIntent / Financial Connections (mocked)", () => {
	afterEach(() => {
		restoreEnv()
		vi.unstubAllGlobals()
	})

	it("initiates SetupIntent microdeposits when live + US bank details", async () => {
		snapshotEnv()
		process.env.STRIPE_SECRET_KEY = "sk_test_live"
		process.env.PAYOUT_RAIL_LIVE = "1"
		delete process.env.PAYOUT_RAIL_VERIFICATION

		const fetchMock = vi.fn(async (url: string) => {
			const path = String(url)
			if (path.endsWith("/v1/customers")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ id: "cus_test_1" }),
				}
			}
			if (path.endsWith("/v1/setup_intents")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: "seti_test_1",
						status: "requires_action",
						next_action: { type: "verify_with_microdeposits" },
					}),
				}
			}
			throw new Error(`unexpected fetch ${path}`)
		})
		vi.stubGlobal("fetch", fetchMock)

		const result = await initiateStripeConnectMicroDeposit({
			accountId: "acc_1",
			providerId: "prov_1",
			actorUserId: "user_1",
			currency: "USD",
			accountNumberLast4: "6789",
			country: "US",
			accountIdentifier: "000123456789",
			routingOrSwift: "110000000",
			accountHolderName: "Acme LLC",
		})

		expect(result.ok).toBe(true)
		expect(result.mode).toBe("live")
		expect(result.externalRef).toBe("seti_test_1")
		expect(result.depositAmountsCents).toBeNull()
		expect(result.verificationMethod).toBe("microdeposits")
		expect(fetchMock).toHaveBeenCalled()
	})

	it("creates Financial Connections session when PAYOUT_RAIL_VERIFICATION=fc", async () => {
		snapshotEnv()
		process.env.STRIPE_SECRET_KEY = "sk_test_live"
		process.env.PAYOUT_RAIL_LIVE = "1"
		process.env.PAYOUT_RAIL_VERIFICATION = "financial_connections"

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				const path = String(url)
				if (path.endsWith("/v1/customers")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({ id: "cus_fc_1" }),
					}
				}
				if (path.endsWith("/v1/financial_connections/sessions")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							id: "fcsess_test_1",
							client_secret: "fcsess_test_1_secret_xyz",
						}),
					}
				}
				throw new Error(`unexpected fetch ${path}`)
			})
		)

		const result = await initiateStripeConnectMicroDeposit({
			accountId: "acc_1",
			providerId: "prov_1",
			actorUserId: "user_1",
			currency: "USD",
			accountNumberLast4: "0000",
			country: "US",
		})

		expect(result.ok).toBe(true)
		expect(result.mode).toBe("live")
		expect(result.externalRef).toBe("fcsess_test_1")
		expect(result.clientSecret).toBe("fcsess_test_1_secret_xyz")
		expect(result.verificationMethod).toBe("financial_connections")
	})

	it("confirms SetupIntent via verify_microdeposits", async () => {
		snapshotEnv()
		process.env.STRIPE_SECRET_KEY = "sk_test_live"

		const fetchMock = vi.fn(async (url: string) => {
			expect(String(url)).toContain("/v1/setup_intents/seti_abc/verify_microdeposits")
			return {
				ok: true,
				status: 200,
				json: async () => ({ id: "seti_abc", status: "succeeded" }),
			}
		})
		vi.stubGlobal("fetch", fetchMock)

		const { confirmStripeConnectMicroDeposit } = await import("@/lib/payout-rail/stripeConnect")
		const confirmed = await confirmStripeConnectMicroDeposit({
			externalRef: "seti_abc",
			amount1Cents: 32,
			amount2Cents: 45,
		})
		expect(confirmed.ok).toBe(true)
	})
})
