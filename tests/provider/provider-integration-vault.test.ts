import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
	decryptProviderIntegrationSecret,
	encryptProviderIntegrationSecret,
	isProviderIntegrationTokenExpired,
	shouldRefreshProviderIntegrationToken,
} from "@/lib/provider-integration-vault"

describe("provider integration vault", () => {
	function clearEnv() {
		delete process.env.PROVIDER_INTEGRATION_SECRETS_KEY
		delete process.env.PROVIDER_INTEGRATION_SECRETS_PREVIOUS_KEYS
		delete process.env.NODE_ENV
	}

	beforeEach(clearEnv)
	afterEach(clearEnv)

	it("fails closed in production without a strong integration secrets key", () => {
		process.env.NODE_ENV = "production"
		expect(() =>
			encryptProviderIntegrationSecret({
				providerId: "provider_1",
				connectionId: "connection_1",
				payload: {
					v: 1,
					authType: "oauth2",
					tokenType: "bearer",
					accessToken: "access_secret",
					refreshToken: "refresh_secret",
					obtainedAt: new Date().toISOString(),
				},
			})
		).toThrow("INTEGRATION_VAULT_KEY_REQUIRED")
	})

	it("encrypts OAuth tokens with provider/connection-bound AAD", () => {
		process.env.PROVIDER_INTEGRATION_SECRETS_KEY =
			"provider-integration-vault-test-secret-with-more-than-32-chars"
		const encrypted = encryptProviderIntegrationSecret({
			providerId: "provider_1",
			connectionId: "connection_1",
			payload: {
				v: 1,
				authType: "oauth2",
				tokenType: "bearer",
				accessToken: "access_secret",
				refreshToken: "refresh_secret",
				scope: "availability:sync rates:sync",
				obtainedAt: new Date().toISOString(),
				expiresAt: new Date(Date.now() + 3600_000).toISOString(),
			},
		})
		expect(JSON.stringify(encrypted)).not.toContain("access_secret")
		expect(JSON.stringify(encrypted)).not.toContain("refresh_secret")
		const decrypted = decryptProviderIntegrationSecret({
			providerId: "provider_1",
			connectionId: "connection_1",
			authType: "oauth2",
			encrypted,
		})
		expect(decrypted.authType).toBe("oauth2")
		if (decrypted.authType !== "oauth2") throw new Error("Expected OAuth vault payload")
		expect(decrypted.accessToken).toBe("access_secret")
		expect(() =>
			decryptProviderIntegrationSecret({
				providerId: "provider_1",
				connectionId: "connection_2",
				authType: "oauth2",
				encrypted,
			})
		).toThrow("INTEGRATION_VAULT_DECRYPT_FAILED")
	})

	it("detects refresh windows and hard expiry", () => {
		const now = new Date("2026-07-27T12:00:00.000Z")
		expect(shouldRefreshProviderIntegrationToken("2026-07-27T12:04:59.000Z", now)).toBe(true)
		expect(shouldRefreshProviderIntegrationToken("2026-07-27T12:06:00.000Z", now)).toBe(false)
		expect(isProviderIntegrationTokenExpired("2026-07-27T11:59:59.000Z", now)).toBe(true)
	})
})
