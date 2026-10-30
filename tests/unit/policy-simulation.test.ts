import { beforeEach, describe, expect, it, vi } from "vitest"
import type { APIContext } from "astro"
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), resolve: vi.fn() }))
vi.mock("@/lib/auth/internal-authorization", () => ({ requireInternalPermission: mocks.authorize }))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	resolveProductCommercialDiagnosis: mocks.resolve,
}))
vi.mock("@/shared/infrastructure/db/client", () => ({
	withPostgresTransaction: (work: () => unknown) => work(),
}))
import { GET } from "@/pages/api/admin/commercial-policies/simulation"
const run = (query: string) => {
	const url = new URL(`http://localhost/api/admin/commercial-policies/simulation?${query}`)
	return GET({ request: new Request(url), url } as APIContext)
}
describe("read-only policy simulation", () => {
	beforeEach(() => {
		vi.resetAllMocks()
		mocks.authorize.mockResolvedValue({})
		mocks.resolve.mockResolvedValue({ diagnosis: { blockers: [], compositionTrace: [] } })
	})
	it("authorizes the exact provider before resolving a product", async () => {
		const response = await run("providerId=owner-a&productId=tour-a&at=2026-10-29")
		expect(response.status).toBe(200)
		expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), "provider.compliance.read", {
			type: "provider",
			id: "owner-a",
		})
		expect(mocks.resolve).toHaveBeenCalledWith({
			providerId: "owner-a",
			productId: "tour-a",
			policyEvaluationAt: new Date("2026-10-29T12:00:00Z"),
		})
		expect(response.headers.get("cache-control")).toContain("no-store")
	})
	it("never resolves data after permission denial", async () => {
		mocks.authorize.mockRejectedValue(new Response("Forbidden", { status: 403 }))
		expect((await run("providerId=other&productId=tour-a")).status).toBe(403)
		expect(mocks.resolve).not.toHaveBeenCalled()
	})
	it("rejects invalid dates before evaluating", async () => {
		expect((await run("providerId=owner-a&productId=tour-a&at=2026-02-31")).status).toBe(422)
		expect(mocks.resolve).not.toHaveBeenCalled()
	})
})
