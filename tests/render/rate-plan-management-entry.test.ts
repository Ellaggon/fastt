import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	productRows: [] as Array<{ productId: string; productType: string }>,
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialEntryContext: vi.fn().mockResolvedValue(null),
	tourContextEntryResponse: vi.fn(),
}))
vi.mock("@/lib/rates/loadProviderRatePlanVariants", () => ({
	loadProviderRatePlanVariants: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/rates/providerRatePlansSurface", () => ({
	buildProviderRatePlansSurface: vi.fn().mockResolvedValue({ ratePlans: [] }),
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	db: { select: () => ({ from: () => ({ where: () => Promise.resolve(mocks.productRows) }) }) },
}))

import Manage from "@/pages/rates/plans/manage.astro"

async function response(query: string) {
	const container = await AstroContainer.create()
	return container.renderToResponse(Manage, {
		request: new Request(`https://fastt.test/rates/plans/manage?productId=tour-1&${query}`),
		locals: {
			getWorkspaceContext: async () => ({
				user: { id: "user-1" },
				provider: { providerId: "provider-1" },
				sidebarDataPromise: Promise.resolve({}),
			}),
		} as never,
	})
}

describe("rendered rate page without tour departures", () => {
	beforeEach(() => {
		mocks.productRows = [{ productId: "tour-1", productType: "tour" }]
	})
	it.each(["launch", "add-room"])(
		"redirects the legacy %s page without flow to the tour guide",
		async (playbook) => {
			const result = await response(`playbook=${playbook}`)
			expect(result.status).toBe(302)
			expect(result.headers.get("location")).toBe(
				"/product/tour-1/departures/new?playbook=launch-tour&step=departure&flow=create"
			)
		}
	)

	it("preserves the completion guide instead of showing an impossible rate form", async () => {
		const result = await response("playbook=complete-to-publish&step=rate&flow=complete")
		expect(result.status).toBe(302)
		expect(result.headers.get("location")).toContain("playbook=complete-to-publish&step=departure")
	})

	it("returns 404 for an unresolved product before rendering a hotel guide", async () => {
		mocks.productRows = []
		const result = await response("playbook=launch")
		expect(result.status).toBe(404)
		expect(await result.text()).toBe("Oferta no encontrada")
	})

	it("keeps the accommodation creation entry on its existing hotel route", async () => {
		mocks.productRows = [{ productId: "tour-1", productType: "hotel" }]
		const result = await response("flow=create")
		expect(result.status).toBe(200)
		const html = await result.text()
		expect(html).toContain("Preparar alojamiento")
		expect(html).not.toContain("Preparar tour")
	})
})
