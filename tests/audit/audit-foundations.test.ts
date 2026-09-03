import { describe, expect, it } from "vitest"

import { redactAuditPayload } from "@/lib/audit/audit-events"
import { commandPayloadHash } from "@/lib/commands/command-idempotency"
import { requestIdFromRequest } from "@/lib/http/request-context"

describe("phase 1 audit and idempotency foundations", () => {
	it("redacts sensitive values recursively before persistence", () => {
		expect(
			redactAuditPayload({
				accountNumber: "123456789",
				metadata: { accessToken: "token", safe: "visible" },
			})
		).toEqual({
			accountNumber: "[redacted]",
			metadata: { accessToken: "[redacted]", safe: "visible" },
		})
	})

	it("hashes equivalent command payloads identically regardless of key order", () => {
		expect(commandPayloadHash({ providerId: "p1", status: "approved" })).toBe(
			commandPayloadHash({ status: "approved", providerId: "p1" })
		)
	})

	it("accepts safe request IDs and replaces invalid values", () => {
		expect(
			requestIdFromRequest(
				new Request("http://localhost", { headers: { "x-request-id": "req-12345678" } })
			)
		).toBe("req-12345678")
		expect(
			requestIdFromRequest(
				new Request("http://localhost", { headers: { "x-request-id": "bad id" } })
			)
		).toMatch(/^[0-9a-f-]{36}$/)
	})
})
