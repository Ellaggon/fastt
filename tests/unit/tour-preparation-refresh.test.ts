import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ owned: vi.fn(), refresh: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	Product: { id: "id", providerId: "provider" },
	and: vi.fn(),
	eq: vi.fn(),
	inArray: vi.fn(),
	db: { select: () => ({ from: () => ({ where: mocks.owned }) }) },
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user", email: "provider@example.test" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/lib/onboarding/preparationSession", () => ({
	listActivePreparationSessions: async () => [],
	savedCompleteToPublishHrefForProduct: () =>
		"/product/tour/content?variantId=option&ratePlanId=rate",
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurface: mocks.refresh,
}))
import { POST } from "@/pages/api/internal/product-preparation-refresh"
async function refresh() {
	const url = new URL("https://fastt.test/api/internal/product-preparation-refresh")
	const request = new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ productIds: ["tour", "foreign"] }),
	})
	return (await POST({ request, url } as Parameters<typeof POST>[0])) as Response
}
describe("B5 dashboard refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.owned.mockResolvedValue([{ id: "tour" }])
	})
	it("preserves the fresh diagnostic action instead of replacing it with a stale session URL", async () => {
		const readiness = {
			productId: "tour",
			readinessPercent: 90,
			continuePreparationHref: "/rates/plans/rate?productId=tour&variantId=option&vista=conditions",
			tourPresentation: {
				primaryAction: {
					label: "Revisar condiciones",
					href: "/rates/plans/rate?productId=tour&variantId=option&vista=conditions",
				},
				support: "Condición incompatible",
			},
		}
		mocks.refresh.mockResolvedValue({ productId: "tour", readiness })
		const response = await refresh()
		expect(await response.json()).toMatchObject({ products: [readiness] })
		expect(mocks.refresh).toHaveBeenCalledTimes(1)
		expect(mocks.refresh).toHaveBeenCalledWith(
			expect.objectContaining({
				productId: "tour",
				lastPath: "/product/tour/content?variantId=option&ratePlanId=rate",
			})
		)
	})
	it("keeps lodging resume behavior unchanged", async () => {
		mocks.refresh.mockResolvedValue({
			productId: "tour",
			readiness: { continuePreparationHref: "/product/tour/preview" },
		})
		const response = await refresh()
		expect(await response.json()).toMatchObject({
			products: [
				{ continuePreparationHref: "/product/tour/content?variantId=option&ratePlanId=rate" },
			],
		})
	})
})
