import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	isPublicExternalCalendarAddress,
	resolveExternalCalendarAddress,
} from "@/lib/provider-external-calendar-network"
import {
	decryptExternalCalendarUrl,
	encryptExternalCalendarUrl,
} from "@/lib/provider-external-calendar-secrets"

const secret = "integration-calendar-secret-with-at-least-32-characters"

describe("provider external calendar URL security", () => {
	it("fails closed in production when the encryption key is missing", () => {
		const previousNodeEnv = process.env.NODE_ENV
		const previousVitest = process.env.VITEST
		const previousKey = process.env.PROVIDER_INTEGRATION_SECRETS_KEY
		process.env.NODE_ENV = "production"
		delete process.env.VITEST
		delete process.env.PROVIDER_INTEGRATION_SECRETS_KEY
		try {
			expect(() =>
				encryptExternalCalendarUrl({
					providerId: "provider-a",
					calendarId: "calendar-a",
					url: "https://calendar.example.com/feed.ics",
				})
			).toThrow("ICAL_ENCRYPTION_KEY_REQUIRED")
		} finally {
			if (previousNodeEnv === undefined) delete process.env.NODE_ENV
			else process.env.NODE_ENV = previousNodeEnv
			if (previousVitest === undefined) delete process.env.VITEST
			else process.env.VITEST = previousVitest
			if (previousKey === undefined) delete process.env.PROVIDER_INTEGRATION_SECRETS_KEY
			else process.env.PROVIDER_INTEGRATION_SECRETS_KEY = previousKey
		}
	})

	it("encrypts URLs with authenticated context and never includes plaintext", () => {
		const url = "https://calendar.example.com/private/feed.ics?token=super-secret"
		const first = encryptExternalCalendarUrl({
			providerId: "provider-a",
			calendarId: "calendar-a",
			url,
			secret,
		})
		const second = encryptExternalCalendarUrl({
			providerId: "provider-a",
			calendarId: "calendar-a",
			url,
			secret,
		})

		expect(JSON.stringify(first.encrypted)).not.toContain("super-secret")
		expect(first.encrypted.ciphertext).not.toBe(second.encrypted.ciphertext)
		expect(first.fingerprint).toBe(second.fingerprint)
		expect(
			decryptExternalCalendarUrl({
				providerId: "provider-a",
				calendarId: "calendar-a",
				encrypted: first.encrypted,
				secret,
			})
		).toBe(url)
	})

	it("rejects ciphertext copied to another provider or calendar", () => {
		const encrypted = encryptExternalCalendarUrl({
			providerId: "provider-a",
			calendarId: "calendar-a",
			url: "https://calendar.example.com/feed.ics?token=secret",
			secret,
		}).encrypted

		expect(() =>
			decryptExternalCalendarUrl({
				providerId: "provider-b",
				calendarId: "calendar-a",
				encrypted,
				secret,
			})
		).toThrow("ICAL_ENCRYPTED_URL_UNREADABLE")
	})

	it("classifies private, reserved and public addresses conservatively", () => {
		for (const address of [
			"127.0.0.1",
			"10.20.30.40",
			"100.64.0.1",
			"169.254.169.254",
			"192.168.1.2",
			"198.51.100.10",
			"::1",
			"fc00::1",
			"fe80::1",
			"2001:db8::1",
		]) {
			expect(isPublicExternalCalendarAddress(address)).toBe(false)
		}
		expect(isPublicExternalCalendarAddress("1.1.1.1")).toBe(true)
		expect(isPublicExternalCalendarAddress("2606:4700:4700::1111")).toBe(true)
	})

	it("rejects DNS answers containing any private address", async () => {
		await expect(
			resolveExternalCalendarAddress("calendar.example.com", async () => [
				{ address: "1.1.1.1", family: 4 },
				{ address: "169.254.169.254", family: 4 },
			])
		).rejects.toThrow("ICAL_DNS_PRIVATE_ADDRESS")
	})

	it("returns the validated public address that will be pinned to the TLS socket", async () => {
		await expect(
			resolveExternalCalendarAddress("calendar.example.com", async () => [
				{ address: "2606:4700:4700::1111", family: 6 },
				{ address: "1.1.1.1", family: 4 },
			])
		).resolves.toEqual({ address: "2606:4700:4700::1111", family: 6 })
	})

	it("keeps the canonical schema free of a plaintext feed URL column", () => {
		const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		const service = readFileSync("src/lib/provider-external-calendars.ts", "utf8")
		expect(schema).not.toMatch(/\bfeedUrl:\s*txt\(/)
		expect(schema).toContain('feedUrlEncrypted: jsonb("feedUrlEncrypted").notNull()')
		expect(schema).toContain('feedUrlFingerprint: txt("feedUrlFingerprint")')
		expect(service).toContain("decryptExternalCalendarUrl")
		expect(service).not.toContain("calendar.feedUrl,")
	})
})
