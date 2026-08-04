import { afterEach, describe, expect, it, vi } from "vitest"

import { runChannelManagerVendorSmokeTest } from "@/lib/provider-channel-manager-smoke"
import {
	assertProviderIntegrationTestCredentialAllowed,
	canUseProviderIntegrationTestHarness,
	isSyntheticProviderIntegrationCredential,
} from "@/lib/provider-integration-test-harness"

describe("provider integration synthetic credential guard", () => {
	afterEach(() => vi.restoreAllMocks())

	it("recognizes synthetic credentials", () => {
		expect(isSyntheticProviderIntegrationCredential("test://cloudbeds-ok")).toBe(true)
		expect(isSyntheticProviderIntegrationCredential("real-api-key")).toBe(false)
	})

	it("allows tests and explicitly enabled development sandboxes", () => {
		expect(
			canUseProviderIntegrationTestHarness({ env: { NODE_ENV: "test" }, mode: "sandbox" })
		).toBe(true)
		expect(
			canUseProviderIntegrationTestHarness({
				env: { NODE_ENV: "development", PROVIDER_INTEGRATION_TEST_HARNESS: "true" },
				mode: "sandbox",
			})
		).toBe(true)
	})

	it("never allows synthetic credentials in production mode or runtime", () => {
		expect(
			canUseProviderIntegrationTestHarness({ env: { NODE_ENV: "test" }, mode: "production" })
		).toBe(false)
		expect(
			canUseProviderIntegrationTestHarness({
				env: { NODE_ENV: "production", PROVIDER_INTEGRATION_TEST_HARNESS: "true" },
				mode: "sandbox",
			})
		).toBe(false)
	})

	it("rejects a synthetic production credential", () => {
		expect(() =>
			assertProviderIntegrationTestCredentialAllowed("test://channex-ok", {
				env: { NODE_ENV: "test" },
				mode: "production",
			})
		).toThrow("INTEGRATION_TEST_CREDENTIAL_FORBIDDEN")
	})

	it("uses the Channex host that matches the connection mode", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

		await runChannelManagerVendorSmokeTest({
			vendorKey: "channex",
			authType: "api_key",
			credentialSecret: "real-staging-key",
			mode: "sandbox",
		})
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://staging.channex.io/api/v1")

		await runChannelManagerVendorSmokeTest({
			vendorKey: "channex",
			authType: "api_key",
			credentialSecret: "real-production-key",
			mode: "production",
		})
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://app.channex.io/api/v1")
	})
})
