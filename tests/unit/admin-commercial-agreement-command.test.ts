import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { APIContext } from "astro"
const mocks = vi.hoisted(() => ({
	permission: vi.fn(),
	mfa: vi.fn(),
	offer: vi.fn(),
	withdraw: vi.fn(),
}))
vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: mocks.permission,
}))
vi.mock("@/lib/auth/internal-step-up", () => ({ requireRecentInternalAuthentication: mocks.mfa }))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateProvider: vi.fn(),
	invalidateProviderGovernance: vi.fn(),
}))
vi.mock("@/modules/financial/commercial-agreements", () => ({
	AgreementError: class extends Error {},
	offerCommercialAgreement: mocks.offer,
	withdrawCommercialAgreement: mocks.withdraw,
}))
import { POST } from "@/pages/api/admin/commercial-agreements"
const user = { id: "reviewer", email: "reviewer@fastt.test" }
function request(action = "offer") {
	const body = new FormData()
	body.set("providerId", "provider-a")
	body.set("agreementId", "agreement-a")
	body.set("action", action)
	return new Request("http://localhost:4321/api/admin/commercial-agreements", {
		method: "POST",
		body,
		headers: { origin: "http://localhost:4321" },
	})
}
beforeEach(() => {
	vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "prepare")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_PROVIDER_IDS", "provider-a")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE", "unit-test-review")
	vi.resetAllMocks()
	mocks.permission.mockResolvedValue({ user })
	mocks.mfa.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
describe("admin agreement authorization", () => {
	it("disables the API without executing a command when the release is off", async () => {
		vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "off")
		expect((await POST({ request: request() } as APIContext)).status).toBe(404)
		expect(mocks.offer).not.toHaveBeenCalled()
		expect(mocks.withdraw).not.toHaveBeenCalled()
	})
	it("requires scoped financial permission before writing", async () => {
		mocks.permission.mockRejectedValue(new Response("Forbidden", { status: 403 }))
		const result = await POST({ request: request() } as APIContext)
		expect(result.status).toBe(403)
		expect(mocks.permission).toHaveBeenCalledWith(
			expect.any(Request),
			"commercial_policy.finance.approve",
			{ type: "provider", id: "provider-a" }
		)
		expect(mocks.offer).not.toHaveBeenCalled()
	})
	it("requires recent MFA without emitting a proposal", async () => {
		mocks.mfa.mockRejectedValue(
			Response.json({ error: "reauthentication_required" }, { status: 401 })
		)
		expect((await POST({ request: request() } as APIContext)).status).toBe(401)
		expect(mocks.offer).not.toHaveBeenCalled()
	})
	it("does not offer an administrator action to accept on behalf of the provider", async () => {
		expect((await POST({ request: request("accept") } as APIContext)).status).toBe(422)
		expect(mocks.offer).not.toHaveBeenCalled()
		expect(mocks.withdraw).not.toHaveBeenCalled()
	})
})
