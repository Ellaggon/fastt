import { beforeEach, describe, expect, it, vi } from "vitest"

const security = vi.hoisted(() => ({
	requireInternalPermission: vi.fn(),
	requireRecentInternalAuthentication: vi.fn(),
}))

vi.mock("@/lib/commands/sensitive-command", () => ({
	executeSensitiveCommand: async (params: {
		authorize?: () => Promise<void>
		execute: () => Promise<unknown>
	}) => {
		await params.authorize?.()
		return params.execute()
	},
}))

vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: security.requireInternalPermission,
}))

vi.mock("@/lib/auth/internal-step-up", () => ({
	requireRecentInternalAuthentication: security.requireRecentInternalAuthentication,
}))

import { POST as documentReview } from "@/pages/api/admin/providers/documents"
import { POST as paymentAccountReview } from "@/pages/api/admin/providers/payment-accounts"
import { POST as taxReview } from "@/pages/api/admin/providers/tax-configuration"
import { POST as verificationReview } from "@/pages/api/admin/providers/verification"

const principal = {
	user: { id: "reviewer-1", email: "reviewer@fastt.test" },
	mode: "iam" as const,
	roles: ["reviewer"],
	grants: [],
}

function jsonRequest(path: string, body: Record<string, unknown>) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "Idempotency-Key": "mfa-test-command-1" },
		body: JSON.stringify(body),
	})
}

describe("admin sensitive commands require recent MFA", () => {
	beforeEach(() => {
		security.requireInternalPermission.mockReset()
		security.requireRecentInternalAuthentication.mockReset()
		security.requireInternalPermission.mockResolvedValue(principal)
		security.requireRecentInternalAuthentication.mockRejectedValue(
			new Response(JSON.stringify({ error: "reauthentication_required" }), { status: 401 })
		)
	})

	it.each([
		[
			"identity approval or rejection",
			verificationReview,
			{ providerId: "provider-1", status: "approved" },
		],
		["fiscal approval or rejection", taxReview, { providerId: "provider-1", status: "approved" }],
		[
			"payment account review or modification",
			paymentAccountReview,
			{ providerId: "provider-1", accountId: "account-1", status: "approved" },
		],
		[
			"evidence review",
			documentReview,
			{ providerId: "provider-1", documentId: "document-1", status: "approved" },
		],
	] as const)("blocks %s without a recent elevated session", async (_label, handler, body) => {
		const response = await handler({ request: jsonRequest("/api/admin/test", body) } as any)

		expect(response.status).toBe(401)
		expect(await response.json()).toEqual({ error: "reauthentication_required" })
		expect(security.requireRecentInternalAuthentication).toHaveBeenCalledWith({
			request: expect.any(Request),
			user: principal.user,
		})
	})
})
