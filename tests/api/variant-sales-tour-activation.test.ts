import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	getUserFromRequest: vi.fn(),
	getProviderIdFromRequest: vi.fn(),
	invalidateVariant: vi.fn(),
	setVariantSalesEnabled: vi.fn(),
	getVariantById: vi.fn(),
	ensureProductOwnedByProvider: vi.fn(),
}))

vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: mocks.getUserFromRequest,
}))

vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: mocks.getProviderIdFromRequest,
}))

vi.mock("@/lib/cache/invalidation", () => ({ invalidateVariant: mocks.invalidateVariant }))

vi.mock("@/modules/catalog/public", () => ({
	setVariantSalesEnabled: mocks.setVariantSalesEnabled,
}))

vi.mock("@/container", () => ({
	variantManagementRepository: { getVariantById: mocks.getVariantById },
	productRepository: { ensureProductOwnedByProvider: mocks.ensureProductOwnedByProvider },
}))

import { POST } from "@/pages/api/variant/sales"

function formRequest(salesEnabled: boolean) {
	const form = new FormData()
	form.set("variantId", "tour-slot-1")
	form.set("salesEnabled", String(salesEnabled))
	return new Request("http://localhost/api/variant/sales", {
		method: "POST",
		body: form,
	})
}

describe("generic variant sales endpoint for tours", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getUserFromRequest.mockResolvedValue({ id: "user-1", email: "owner@example.test" })
		mocks.getProviderIdFromRequest.mockResolvedValue("provider-1")
		mocks.getVariantById.mockResolvedValue({ id: "tour-slot-1", productId: "tour-1" })
		mocks.ensureProductOwnedByProvider.mockResolvedValue({
			id: "tour-1",
			productType: "tour",
		})
		mocks.setVariantSalesEnabled.mockResolvedValue({
			variantId: "tour-slot-1",
			salesEnabled: false,
		})
		mocks.invalidateVariant.mockResolvedValue(undefined)
	})

	it("rejects direct tour activation and sends the provider to guided review", async () => {
		const response = await POST({ request: formRequest(true) } as never)
		const payload = await response.json()

		expect(response.status).toBe(409)
		expect(payload).toMatchObject({ error: "TOUR_GUIDED_ACTIVATION_REQUIRED" })
		expect(payload.nextActionHref).toContain("playbook=complete-to-publish")
		expect(mocks.setVariantSalesEnabled).not.toHaveBeenCalled()
	})

	it("still lets the provider pause a tour through the generic endpoint", async () => {
		const response = await POST({ request: formRequest(false) } as never)

		expect(response.status).toBe(200)
		expect(mocks.setVariantSalesEnabled).toHaveBeenCalledWith(expect.anything(), {
			variantId: "tour-slot-1",
			salesEnabled: false,
		})
	})
})
