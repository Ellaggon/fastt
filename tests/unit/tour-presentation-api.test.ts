import { randomUUID } from "node:crypto"
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ save: vi.fn(), user: vi.fn(), provider: vi.fn() }))
vi.mock("@/container", () => ({ productRepository: { saveTourPresentation: mocks.save } }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: mocks.user }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({ getProviderIdFromRequest: mocks.provider }))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateProduct: vi.fn(),
	invalidateProvider: vi.fn(),
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: vi.fn(),
}))
import { POST } from "@/pages/api/product/tour-presentation"
const productId = randomUUID()
function request(values: Record<string, string> = {}) {
	const form = new FormData()
	for (const [key, value] of Object.entries({
		productId,
		mode: "edit",
		name: "Paseo",
		geoPlaceId: "city",
		description: "Una descripción",
		highlights: "Guía local\nCentro histórico",
		categoryId: "culture",
		playbook: "launch-tour",
		flow: "create",
		tourFlowVersion: "2",
		variantId: "option",
		ratePlanId: "rate",
		...values,
	}))
		form.set(key, value)
	return new Request("https://fastt.test/api/product/tour-presentation", {
		method: "POST",
		body: form,
	})
}
beforeEach(() => {
	vi.clearAllMocks()
	mocks.user.mockResolvedValue({ id: "user" })
	mocks.provider.mockResolvedValue("provider")
	mocks.save.mockResolvedValue(undefined)
})
it("saves once and advances directly to stage two preserving the commercial selection", async () => {
	const response = await POST({ request: request() } as never)
	expect(response.status).toBe(200)
	const result = await response.json()
	const url = new URL(result.nextHref, "https://fastt.test")
	expect(url.pathname).toBe(`/product/${productId}/location`)
	expect(url.searchParams.get("step")).toBe("location")
	expect(url.searchParams.get("variantId")).toBe("option")
	expect(url.searchParams.get("ratePlanId")).toBe("rate")
	expect(mocks.save).toHaveBeenCalledOnce()
	expect(mocks.save).toHaveBeenCalledWith(
		expect.objectContaining({
			providerId: "provider",
			actorId: "user",
			highlights: ["Guía local", "Centro histórico"],
			categoryIds: ["culture"],
		})
	)
})
it("returns field errors before saving incomplete continuation", async () => {
	const response = await POST({ request: request({ description: "", categoryId: "" }) } as never)
	expect(response.status).toBe(400)
	expect((await response.json()).fieldErrors.description).toBeDefined()
	expect(mocks.save).not.toHaveBeenCalled()
})
it("allows an intentional partial draft exit without advancing the stage", async () => {
	const form = await request({ playbookNav: "exit", description: "", highlights: "" }).formData()
	form.delete("categoryId")
	const response = await POST({
		request: new Request("https://fastt.test/api/product/tour-presentation", {
			method: "POST",
			body: form,
		}),
	} as never)
	expect(response.status).toBe(200)
	expect((await response.json()).nextHref).toBe(`/product/${productId}`)
})
it("rejects an expired session without changing persisted data", async () => {
	mocks.user.mockResolvedValue(null)
	const response = await POST({ request: request() } as never)
	expect(response.status).toBe(401)
	expect(mocks.save).not.toHaveBeenCalled()
})
