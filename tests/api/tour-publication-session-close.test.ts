import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	owned: vi.fn(),
	context: vi.fn(),
	validation: vi.fn(),
	provider: vi.fn(),
	commercial: vi.fn(),
	line: vi.fn(),
	publish: vi.fn(),
	close: vi.fn(),
	refresh: vi.fn(),
}))
vi.mock("@/container", () => ({ productRepository: { ensureProductOwnedByProvider: mocks.owned } }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user", email: "owner@example.test" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: mocks.context,
	tourContextValidationResponse: () => null,
}))
vi.mock("@/lib/product/canonical-product-publication", () => ({
	resolveCanonicalProductPublicationValidationErrors: mocks.validation,
}))
vi.mock("@/lib/provider-governance", () => ({ assertProviderCapability: mocks.provider }))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	assertProductCommercialCapability: mocks.commercial,
	CommercialPolicyBlockedError: class extends Error {},
}))
vi.mock("@/lib/verification/line-gate", () => ({
	assertProductLineGate: mocks.line,
	ProductLineGateBlockedError: class extends Error {},
}))
vi.mock("@/modules/catalog/public", () => ({ publishProduct: mocks.publish }))
vi.mock("@/lib/onboarding/preparationSession", () => ({
	completeTourPreparationSessions: mocks.close,
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: mocks.refresh,
}))
import { POST } from "@/pages/api/product/publish"
async function send() {
	const body = new FormData()
	body.set("productId", "tour")
	body.set("variantId", "option")
	body.set("ratePlanId", "rate")
	return POST({
		request: new Request("http://fastt.test/api/product/publish", { method: "POST", body }),
	} as never) as Promise<Response>
}
beforeEach(() => {
	vi.resetAllMocks()
	mocks.owned.mockResolvedValue({ productType: "tour" })
	mocks.context.mockResolvedValue({ status: "resolved", variantId: "option", ratePlanId: "rate" })
	mocks.validation.mockResolvedValue([])
	mocks.publish.mockResolvedValue({ ok: true, state: "published" })
})
describe("tour publication and session lifecycle", () => {
	it("reevaluates the selected offer and closes both playbooks only after confirmed publication", async () => {
		expect((await send()).status).toBe(200)
		expect(mocks.validation).toHaveBeenCalledWith(
			expect.objectContaining({ selection: { variantId: "option", ratePlanId: "rate" } })
		)
		expect(mocks.provider).toHaveBeenCalledOnce()
		expect(mocks.commercial).toHaveBeenCalledOnce()
		expect(mocks.line).toHaveBeenCalledOnce()
		expect(mocks.close).toHaveBeenCalledWith("provider", "tour")
		expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.close.mock.invocationCallOrder[0]
		)
	})
	it("keeps sessions and previously saved activation when publication is blocked", async () => {
		mocks.validation.mockResolvedValue([{ code: "PHOTOS_MISSING", message: "Agrega fotos" }])
		const response = await send()
		expect(response.status).toBe(422)
		expect(await response.json()).toMatchObject({ error: "tour_publication_blocked" })
		expect(mocks.publish).not.toHaveBeenCalled()
		expect(mocks.close).not.toHaveBeenCalled()
	})
	it("does not close sessions when the publication command fails", async () => {
		mocks.publish.mockRejectedValue(new Error("Publication unavailable"))
		expect((await send()).status).toBe(500)
		expect(mocks.close).not.toHaveBeenCalled()
		expect(mocks.refresh).not.toHaveBeenCalled()
	})
	it("leaves hotel session behavior unchanged", async () => {
		mocks.owned.mockResolvedValue({ productType: "hotel" })
		expect((await send()).status).toBe(200)
		expect(mocks.close).not.toHaveBeenCalled()
	})
})
