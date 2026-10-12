import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	session: vi.fn(),
	owned: vi.fn(),
	save: vi.fn(),
	refresh: vi.fn(),
	invalidate: vi.fn(),
}))
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: mocks.session,
}))
vi.mock("@/container", () => ({
	productRepository: { ensureProductOwnedByProvider: mocks.owned },
	subtypeRepository: { saveTourProgram: mocks.save },
}))
vi.mock("@/lib/cache/invalidation", () => ({ invalidateProduct: mocks.invalidate }))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: mocks.refresh,
}))
import { POST } from "@/pages/api/product/subtype"
const call = () => {
	const form = new FormData()
	form.set("productId", "experience")
	form.set("tourItinerary", "Práctica")
	return POST({
		request: new Request("http://localhost/api/product/subtype", { method: "POST", body: form }),
	} as never)
}
beforeEach(() => {
	vi.clearAllMocks()
	mocks.session.mockResolvedValue({ providerId: "owner", permissions: { canEditProfile: true } })
	mocks.owned.mockResolvedValue({ productType: "tour" })
	mocks.save.mockImplementation(async () => Response.json({ ok: true }))
	mocks.refresh.mockResolvedValue(undefined)
	mocks.invalidate.mockResolvedValue(undefined)
})
it("checks edit authorization before saving", async () => {
	mocks.session.mockResolvedValue({ providerId: "owner", permissions: { canEditProfile: false } })
	expect((await call()).status).toBe(403)
	expect(mocks.save).not.toHaveBeenCalled()
})
it("uses the atomic tour save and transports its errors", async () => {
	mocks.save.mockResolvedValue(Response.json({ error: "Formato cambió" }, { status: 409 }))
	expect((await call()).status).toBe(409)
	expect(mocks.save).toHaveBeenCalledWith("experience", "owner", expect.any(FormData))
	expect(mocks.refresh).not.toHaveBeenCalled()
})
it("a failed projection does not report a committed save as failed", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {})
	try {
		mocks.refresh.mockRejectedValue(new Error("projection unavailable"))
		expect((await call()).status).toBe(200)
	} finally {
		log.mockRestore()
	}
})
