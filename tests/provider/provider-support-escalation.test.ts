import { afterEach, describe, expect, it } from "vitest"

import {
	buildProviderSupportAlertEmailContent,
	providerSupportAlertReadiness,
} from "@/lib/email/providerSupportAlertEmail"
import { parseSupportInboxFilter, parseSupportInboxPage } from "@/lib/provider-support"

const originalEnv = {
	publicAppUrl: process.env.PUBLIC_APP_URL,
	provider: process.env.EMAIL_PROVIDER,
	apiKey: process.env.RESEND_API_KEY,
	from: process.env.EMAIL_FROM,
	to: process.env.PROVIDER_SUPPORT_ALERT_TO,
}

afterEach(() => {
	for (const [key, value] of [
		["PUBLIC_APP_URL", originalEnv.publicAppUrl],
		["EMAIL_PROVIDER", originalEnv.provider],
		["RESEND_API_KEY", originalEnv.apiKey],
		["EMAIL_FROM", originalEnv.from],
		["PROVIDER_SUPPORT_ALERT_TO", originalEnv.to],
	] as const) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

describe("provider support escalation", () => {
	it("validates inbox filters and clamps malformed pages to the first page", () => {
		expect(parseSupportInboxFilter("resolved")).toBe("resolved")
		expect(parseSupportInboxFilter("unexpected")).toBe("open")
		expect(parseSupportInboxPage("3")).toBe(3)
		expect(parseSupportInboxPage("-2")).toBe(1)
		expect(parseSupportInboxPage("9999999")).toBe(1)
	})

	it("enables email notices only with a recipient and a live Resend configuration", () => {
		process.env.PROVIDER_SUPPORT_ALERT_TO = "ops@example.com"
		process.env.EMAIL_PROVIDER = "resend"
		process.env.RESEND_API_KEY = "test-key"
		process.env.EMAIL_FROM = "Fastt <noreply@example.com>"
		expect(providerSupportAlertReadiness()).toEqual({
			configured: true,
			recipientConfigured: true,
			deliveryConfigured: true,
		})
		delete process.env.PROVIDER_SUPPORT_ALERT_TO
		expect(providerSupportAlertReadiness().configured).toBe(false)
	})

	it("sends enough context to locate the thread without including provider content", () => {
		process.env.PUBLIC_APP_URL = "https://fastt-five.vercel.app"
		const alert = buildProviderSupportAlertEmailContent({
			event: "provider_reply",
			requestId: "56be8e2d-7d6f-4854-a436-66bbf39f0230",
			topic: "other",
			line: "account",
			requestUrl: "https://fallback.example",
		})
		expect(alert.subject).toContain("56BE8E2D")
		expect(alert.text).toContain("https://fastt-five.vercel.app/admin/support?status=open&request=")
		expect(alert.text).not.toContain("datos bancarios")
		expect(alert.text).not.toContain("mensaje privado")
	})
})
