import { describe, expect, it } from "vitest"

import {
	readAccessTokenExpiryMs,
	shouldRefreshAccessToken,
} from "@/lib/auth/accessTokenLifetime"

function encodeJwt(payload: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
	return `${header}.${body}.signature`
}

describe("access token lifetime", () => {
	it("detects when an access token is near expiry", () => {
		const now = Date.UTC(2026, 8, 23, 12, 0, 0)
		const token = encodeJwt({ exp: Math.floor((now + 60_000) / 1000) })
		expect(readAccessTokenExpiryMs(token)).toBe(now + 60_000)
		expect(shouldRefreshAccessToken(token, now)).toBe(true)
	})

	it("keeps a fresh access token without forcing refresh", () => {
		const now = Date.UTC(2026, 8, 23, 12, 0, 0)
		const token = encodeJwt({ exp: Math.floor((now + 15 * 60_000) / 1000) })
		expect(shouldRefreshAccessToken(token, now)).toBe(false)
	})
})
