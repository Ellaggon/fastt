import { beforeEach, describe, expect, it, vi } from "vitest"

const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }))
const idempotency = vi.hoisted(() => ({
	completeCommandIdempotency: vi.fn(),
	failCommandIdempotency: vi.fn(),
	reserveCommandIdempotency: vi.fn(),
	IdempotencyConflictError: class IdempotencyConflictError extends Error {},
}))

vi.mock("@/lib/audit/audit-events", () => audit)
vi.mock("@/lib/commands/command-idempotency", () => idempotency)

import { executeSensitiveCommand } from "@/lib/commands/sensitive-command"

const baseAudit = {
	requestId: "request-123",
	action: "provider.verification.review",
	entityType: "ProviderVerification",
	entityId: "provider-1",
	providerId: "provider-1",
	riskLevel: "high" as const,
}

describe("sensitive command wrapper", () => {
	beforeEach(() => {
		audit.writeAuditEvent.mockReset().mockResolvedValue("audit-id")
		idempotency.reserveCommandIdempotency.mockReset()
		idempotency.completeCommandIdempotency.mockReset().mockResolvedValue(undefined)
		idempotency.failCommandIdempotency.mockReset().mockResolvedValue(undefined)
	})

	it("records attempted and succeeded outcomes around an authorized command", async () => {
		const response = await executeSensitiveCommand({
			audit: { ...baseAudit },
			authorize: vi.fn().mockResolvedValue(undefined),
			execute: vi
				.fn()
				.mockResolvedValue({ response: { ok: true }, afterJson: { status: "approved" } }),
		})

		expect(response).toEqual({ response: { ok: true }, replayed: false })
		expect(audit.writeAuditEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ outcome: "attempted" })
		)
		expect(audit.writeAuditEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ outcome: "succeeded", afterJson: { status: "approved" } })
		)
	})

	it("records a denied outcome and does not reserve a key when authorization fails", async () => {
		const denied = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
		await expect(
			executeSensitiveCommand({
				audit: { ...baseAudit },
				idempotency: { scope: "provider.verification.review", key: "key-1", payload: {} },
				authorize: vi.fn().mockRejectedValue(denied),
				execute: vi.fn(),
			})
		).rejects.toBe(denied)

		expect(idempotency.reserveCommandIdempotency).not.toHaveBeenCalled()
		expect(audit.writeAuditEvent).toHaveBeenLastCalledWith(
			expect.objectContaining({ outcome: "denied", contextJson: { responseStatus: 403 } })
		)
	})

	it("marks a reserved command failed when its business operation throws", async () => {
		idempotency.reserveCommandIdempotency.mockResolvedValue({
			kind: "execute",
			id: "reservation-1",
		})
		await expect(
			executeSensitiveCommand({
				audit: { ...baseAudit },
				idempotency: { scope: "provider.verification.review", key: "key-1", payload: {} },
				execute: vi.fn().mockRejectedValue(new Error("provider_write_failed")),
			})
		).rejects.toThrow("provider_write_failed")

		expect(idempotency.failCommandIdempotency).toHaveBeenCalledWith({ id: "reservation-1" })
		expect(audit.writeAuditEvent).toHaveBeenLastCalledWith(
			expect.objectContaining({ outcome: "failed" })
		)
	})
})
