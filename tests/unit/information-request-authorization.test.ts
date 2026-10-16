import { beforeEach, describe, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
	pilot: true,
	mfa: true,
	domainPermission: true,
	publish: vi.fn(),
}))
vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: () => true,
	isCommandCenterV2PilotProvider: () => state.pilot,
}))
vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: async (_request: Request, permission: string) => {
		if (permission === "provider.fiscal.review" && !state.domainPermission)
			throw new Response(null, { status: 403 })
		return { user: { id: "reviewer" }, roles: ["fiscal_reviewer"] }
	},
}))
vi.mock("@/lib/auth/internal-step-up", () => ({
	requireRecentInternalAuthentication: async () => {
		if (!state.mfa) throw new Response(null, { status: 401 })
	},
}))
vi.mock("@/lib/commands/sensitive-command", () => ({
	executeSensitiveCommand: async (options: any) => {
		expect(options.atomic).toBe(true)
		await options.authorize()
		return { response: (await options.execute()).response, replayed: false }
	},
}))
vi.mock("@/lib/commands/command-idempotency", () => ({
	idempotencyKeyFromRequest: () => "test-key",
	IdempotencyConflictError: class extends Error {},
}))
vi.mock("@/modules/casework/public", () => ({
	informationRequestContext: async () => ({ case: { providerId: "fixture", domain: "fiscal" } }),
	reviewPermissionByDomain: { fiscal: "provider.fiscal.review" },
	publishInformationRequest: (...args: unknown[]) => state.publish(...args),
}))
import { POST } from "@/pages/api/admin/v1/decisions/[decisionId]/publish-request"
const invoke = () =>
	POST({
		request: new Request("http://localhost/api/admin/v1/decisions/test/publish-request", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				caseVersion: 4,
				message: "Solicitar corrección de evidencia sintética",
			}),
		}),
		params: { decisionId: "test" },
	} as any)
describe("information publication authorization", () => {
	beforeEach(() => {
		state.pilot = true
		state.mfa = true
		state.domainPermission = true
		state.publish
			.mockReset()
			.mockResolvedValue({ published: true, caseVersion: 5, channel: "provider_inbox" })
	})
	it("requires recent MFA before publication", async () => {
		state.mfa = false
		expect((await invoke()).status).toBe(401)
		expect(state.publish).not.toHaveBeenCalled()
	})
	it("requires permission for the case domain", async () => {
		state.domainPermission = false
		expect((await invoke()).status).toBe(403)
		expect(state.publish).not.toHaveBeenCalled()
	})
	it("rejects a provider outside the pilot", async () => {
		state.pilot = false
		expect((await invoke()).status).toBe(403)
		expect(state.publish).not.toHaveBeenCalled()
	})
	it("reports the actual channel rather than claiming email delivery", async () => {
		const response = await invoke()
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			published: true,
			channel: "provider_inbox",
		})
	})
})
