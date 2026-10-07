import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"

const mocks = vi.hoisted(() => ({ context: null as any }))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: vi.fn(async () => mocks.context),
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: vi.fn(async () => null) }))

import Conditions from "@/pages/product/[id]/conditions.astro"
const option = {
	variantId: "option-A",
	name: "Opción A",
	lifecycleState: "draft",
	salesEnabled: false,
	hasProfile: true,
	hasCapacity: true,
	bookingMode: "shared" as const,
	rates: [] as any[],
}
const rate = { ratePlanId: "rate-A", name: "Tarifa A", isActive: false, isDefault: true }
async function render(query = "") {
	const container = await AstroContainer.create()
	return container.renderToResponse(Conditions, {
		request: new Request(
			`https://fastt.test/product/tour/conditions?playbook=launch-tour&step=conditions&flow=create&tourFlowVersion=2&${query}`
		),
		params: { id: "tour" },
		locals: {
			getWorkspaceContext: async () => ({
				user: { id: "user" },
				provider: { providerId: "provider" },
				sidebarDataPromise: Promise.resolve({ productTypes: ["tour"] }),
			}),
		} as never,
	})
}
describe("conditions stage dependencies and selection", () => {
	beforeEach(() => {
		mocks.context = resolveTourCommercialContext({ productId: "tour", options: [] })
	})
	it("renders a missing option in the conditions stage rather than rejecting or silently redirecting", async () => {
		const response = await render()
		expect(response.status).toBe(200)
		const html = await response.text()
		expect(html).toContain("Condiciones de reserva")
		expect(html).toContain("Primero crea una opción")
		expect(html).toContain("Crear opción")
		expect(html).not.toContain("negocio seleccionado no coincide")
	})
	it("offers a rate for the selected option while preserving a publication return", async () => {
		mocks.context = resolveTourCommercialContext({ productId: "tour", options: [option] })
		const response = await render("returnTo=%2Fproduct%2Ftour%2Fpreview")
		const html = (await response.text()).replaceAll("&#38;", "&").replaceAll("&amp;", "&")
		expect(html).toContain("Primero crea una tarifa")
		expect(html).toContain("variantId=option-A")
		expect(html).toContain("returnTo=%2Fproduct%2Ftour%2Fpreview")
	})
	it("opens only the resolved rate, without requiring price, dates or activation", async () => {
		mocks.context = resolveTourCommercialContext({
			productId: "tour",
			options: [{ ...option, rates: [rate] }],
		})
		const response = await render("returnTo=%2Fproduct%2Ftour%2Fpreview")
		expect(response.status).toBe(302)
		const target = new URL(response.headers.get("location")!, "https://fastt.test")
		expect(target.pathname).toBe("/rates/plans/rate-A")
		expect(target.searchParams.get("variantId")).toBe("option-A")
		expect(target.searchParams.get("vista")).toBe("conditions")
		const review = new URL(target.searchParams.get("returnTo")!, "https://fastt.test")
		expect(review.pathname).toBe("/product/tour/preview")
		expect(review.searchParams.get("variantId")).toBe("option-A")
		expect(review.searchParams.get("ratePlanId")).toBe("rate-A")
	})
	it("asks for selection with multiple rates and never defaults to the first", async () => {
		mocks.context = resolveTourCommercialContext({
			productId: "tour",
			options: [{ ...option, rates: [rate, { ...rate, ratePlanId: "rate-B", name: "Tarifa B" }] }],
		})
		const response = await render()
		expect(response.status).toBe(200)
		const html = await response.text()
		expect(html).toContain("Elige la opción y tarifa")
		expect(html).toContain("Tarifa A")
		expect(html).toContain("Tarifa B")
	})
	it("does not substitute an explicit invalid selection with another offer", async () => {
		mocks.context = resolveTourCommercialContext({
			productId: "tour",
			options: [{ ...option, rates: [rate] }],
			url: { variantId: "foreign-option" },
		})
		const response = await render("variantId=foreign-option")
		expect(response.status).toBe(400)
		expect(await response.text()).toContain("Revisa la opción y tarifa")
	})
	it("retries the original intent on a failed read and keeps the session offer out of the link", async () => {
		mocks.context = {
			status: "read_failed",
			productId: "tour",
			recoveryIntent: { variantId: "option-A", ratePlanId: "rate-A" },
		}
		const response = await render("variantId=option-A&ratePlanId=rate-A")
		expect(response.status).toBe(503)
		const html = await response.text()
		expect(html).toContain("Volver a intentar")
		expect(html).toContain("variantId=option-A")
		expect(html).toContain("ratePlanId=rate-A")
	})
	it.each(["not_found", "not_tour"])("rejects %s before rendering a tour guide", async (status) => {
		mocks.context = { status, productId: "tour" }
		expect((await render()).status).toBe(404)
	})
})
