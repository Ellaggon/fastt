import { describe, it, expect, vi, beforeEach } from "vitest"
const f = vi.hoisted(() => ({
	auth: vi.fn(),
	load: vi.fn(),
	save: vi.fn(),
	invalidate: vi.fn(),
	product: vi.fn(),
}))
vi.mock("@/lib/auth/requireProvider", () => ({ requireProvider: f.auth }))
vi.mock("@/lib/policies/tourCheckInRepair", () => ({ loadTourCheckInRepair: f.load }))
vi.mock("@/container/policies-write.container", () => ({
	deactivatePolicyAssignmentCapa6UseCase: f.save,
}))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidatePolicyConditions: f.invalidate,
	invalidateProduct: f.product,
}))
import { POST, GET } from "@/pages/api/policies/repair-tour-checkin"
const ratePlanId = "11111111-1111-4111-8111-111111111111",
	assignmentId = "22222222-2222-4222-8222-222222222222"
const context = { productId: "product", variantId: "option", ratePlanId }
const post = (body: unknown) =>
	POST({
		request: new Request("https://fastt.test/api/policies/repair-tour-checkin", {
			method: "POST",
			body: JSON.stringify(body),
		}),
	} as any)
beforeEach(() => {
	vi.resetAllMocks()
	f.auth.mockResolvedValue({ providerId: "owner", user: { id: "actor" } })
	f.load.mockResolvedValue({
		context,
		assignments: [{ id: assignmentId, scope: "product", scopeId: "product" }],
	})
	f.save.mockResolvedValue({ assignmentId, deactivated: true })
})
describe("tour CheckIn repair HTTP boundary", () => {
	it("requires explicit confirmation and rejects extra scope IDs", async () => {
		for (const body of [
			{ ratePlanId, assignmentId },
			{ ratePlanId, assignmentId, confirm: false },
			{ ratePlanId, assignmentId, confirm: true, productId: "foreign" },
		])
			expect((await post(body)).status).toBe(400)
		expect(f.save).not.toHaveBeenCalled()
	})
	it("cannot access a hotel or foreign tariff", async () => {
		f.load.mockResolvedValue(null)
		expect((await post({ ratePlanId, assignmentId, confirm: true })).status).toBe(404)
		expect(f.save).not.toHaveBeenCalled()
	})
	it("uses persisted context and actor, invalidates inherited scope and tolerates retries", async () => {
		expect((await post({ ratePlanId, assignmentId, confirm: true })).status).toBe(200)
		expect(f.save).toHaveBeenCalledWith({
			assignmentId,
			ownerProviderId: "owner",
			actorUserId: "actor",
			repairContext: context,
		})
		expect(f.invalidate).toHaveBeenCalledWith({
			scope: "product",
			scopeId: "product",
			productId: "product",
		})
		f.load.mockResolvedValue({ context, assignments: [] })
		f.save.mockResolvedValue({ assignmentId, deactivated: false })
		const response = await post({ ratePlanId, assignmentId, confirm: true })
		expect((await response.json()).deactivated).toBe(false)
	})
	it("rejects wrong assignment context rather than showing success", async () => {
		f.save.mockRejectedValue(new Error("TOUR_CHECKIN_REPAIR_CONTEXT_INVALID"))
		expect((await post({ ratePlanId, assignmentId, confirm: true })).status).toBe(409)
		expect(f.invalidate).not.toHaveBeenCalled()
	})
	it("returns no-store candidate lists", async () => {
		const url = new URL(
			`https://fastt.test/api/policies/repair-tour-checkin?ratePlanId=${ratePlanId}`
		)
		const result = await GET({ request: new Request(url), url } as any)
		expect(result.headers.get("Cache-Control")).toBe("no-store")
		expect((await result.json()).assignments).toHaveLength(1)
	})
})
