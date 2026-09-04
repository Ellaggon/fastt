import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.hoisted(() => ({
	requireInternalPermission: vi.fn(),
	requireRecentInternalAuthentication: vi.fn(),
}))

vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: auth.requireInternalPermission,
}))

vi.mock("@/lib/auth/internal-step-up", () => ({
	requireRecentInternalAuthentication: auth.requireRecentInternalAuthentication,
}))

import { POST } from "@/pages/api/admin/policies/exceptions"
import { PATCH } from "@/pages/api/admin/policies/exceptions/[id]"

const editor = {
	user: { id: "policy-editor", email: "policy-editor@fastt.test" },
	mode: "iam" as const,
	roles: ["policy_editor"],
	grants: [],
}

function forbiddenPublishOnly(_request: Request, permission: string) {
	if (permission === "policy.publish") {
		throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
	}
	return Promise.resolve(editor)
}

describe("policy exception route authorization", () => {
	beforeEach(() => {
		auth.requireInternalPermission.mockReset()
		auth.requireRecentInternalAuthentication.mockReset()
		auth.requireInternalPermission.mockImplementation(forbiddenPublishOnly)
	})

	it("requires the draft-and-second-actor workflow instead of creating an approved rule", async () => {
		const response = await POST({
			request: new Request("http://localhost/api/admin/policies/exceptions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "major_disruptive_event",
					scope: "global",
					effectiveFrom: "2030-01-01",
					reason: "Emergency override requires publication",
					action: {
						refundOverridePercent: 100,
						note: "Evidence ticket validates this exceptional policy override",
						approval: { status: "approved" },
					},
				}),
			}),
		} as any)

		expect(response.status).toBe(409)
		expect(await response.json()).toEqual({ error: "approval_workflow_required" })
		expect(auth.requireInternalPermission.mock.calls.map((call) => call[1])).toEqual([
			"policy.edit",
		])
	})

	it("requires policy.publish before an editor can approve a draft", async () => {
		const response = await PATCH({
			params: { id: "rule-1" },
			request: new Request("http://localhost/api/admin/policies/exceptions/rule-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					operation: "approve",
					reason: "A policy editor cannot publish this draft alone",
				}),
			}),
		} as any)

		expect(response.status).toBe(403)
		expect(auth.requireInternalPermission.mock.calls.map((call) => call[1])).toEqual([
			"policy.edit",
			"policy.publish",
		])
	})

	it("requires a recent elevated session after policy.publish is authorized", async () => {
		auth.requireInternalPermission.mockResolvedValue(editor)
		auth.requireRecentInternalAuthentication.mockRejectedValue(
			new Response(JSON.stringify({ error: "reauthentication_required" }), { status: 401 })
		)

		const response = await PATCH({
			params: { id: "rule-1" },
			request: new Request("http://localhost/api/admin/policies/exceptions/rule-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					operation: "approve",
					reason: "A policy publisher needs recent MFA to approve",
				}),
			}),
		} as any)

		expect(response.status).toBe(401)
		expect(auth.requireInternalPermission.mock.calls.map((call) => call[1])).toEqual([
			"policy.edit",
			"policy.publish",
		])
		expect(auth.requireRecentInternalAuthentication).toHaveBeenCalledWith({
			request: expect.any(Request),
			user: editor.user,
		})
	})
})
