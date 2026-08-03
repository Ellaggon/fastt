import { describe, expect, it } from "vitest"
import { getPasswordResetRedirectTo } from "../../src/lib/auth/passwordRecovery"

describe("password recovery redirect", () => {
	it("returns to the local origin when recovery starts locally", () => {
		expect(getPasswordResetRedirectTo("http://localhost:4321/api/auth/recover-password")).toBe(
			"http://localhost:4321/auth/reset-password"
		)
	})

	it("returns to the deployed origin when recovery starts in production", () => {
		expect(
			getPasswordResetRedirectTo("https://fastt-five.vercel.app/api/auth/recover-password")
		).toBe("https://fastt-five.vercel.app/auth/reset-password")
	})

	it("uses a valid explicit override", () => {
		expect(
			getPasswordResetRedirectTo(
				"http://localhost:4321/api/auth/recover-password",
				"https://auth.fastt.test/reset"
			)
		).toBe("https://auth.fastt.test/reset")
	})

	it("rejects a non-http override", () => {
		expect(() =>
			getPasswordResetRedirectTo(
				"http://localhost:4321/api/auth/recover-password",
				"javascript:alert(1)"
			)
		).toThrow("AUTH_PASSWORD_RESET_REDIRECT_URL")
	})
})
