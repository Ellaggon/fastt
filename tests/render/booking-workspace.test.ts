import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	user: { id: "user-1" } as { id: string } | null,
	provider: { providerId: "provider-1" } as { providerId: string } | null,
	productTypes: ["Tour"] as string[],
	lines: ["tour"] as string[],
	products: {
		tour: { id: "tour-1", name: "Tour de prueba", productType: "Tour" },
		hotel: { id: "hotel-1", name: "Alojamiento de prueba", productType: "Hotel" },
	},
	variant: { id: "departure-1", productId: "tour-1" } as { id: string; productId: string } | null,
	pendingCount: 2,
}))

vi.mock("@/container", () => ({
	productRepository: {
		ensureProductOwnedByProvider: vi.fn(async (id: string) =>
			id === state.products.tour.id
				? state.products.tour
				: id === state.products.hotel.id
					? state.products.hotel
					: null
		),
	},
	variantManagementRepository: {
		getVariantById: vi.fn(async (id: string) => (id === state.variant?.id ? state.variant : null)),
	},
}))

vi.mock("@/modules/catalog/public", () => ({
	countPendingTourPrivateRequests: vi.fn(async () => state.pendingCount),
}))

vi.mock("@/lib/booking/providerOperationalDay", () => ({
	loadProviderOperationalDay: vi.fn(async () => ({
		date: "2026-10-04",
		timezone: "America/La_Paz",
	})),
}))

vi.mock("@/lib/verification/commercial-lines", () => ({
	listProviderCommercialLines: vi.fn(async () => state.lines.map((line) => ({ line }))),
}))

import Page from "@/pages/booking/index.astro"

async function render(query = "") {
	const container = await AstroContainer.create()
	return container.renderToResponse(Page, {
		request: new Request(`https://fastt.test/booking${query ? `?${query}` : ""}`),
		locals: {
			getWorkspaceContext: async () => ({
				user: state.user,
				provider: state.provider,
				sidebarDataPromise: Promise.resolve({ productTypes: state.productTypes }),
			}),
		} as never,
	})
}

describe("booking workspace context", () => {
	beforeEach(() => {
		state.user = { id: "user-1" }
		state.provider = { providerId: "provider-1" }
		state.productTypes = ["Tour"]
		state.lines = ["tour"]
		state.variant = { id: "departure-1", productId: "tour-1" }
	})

	it("sends an unauthenticated visitor to sign in", async () => {
		state.user = null
		state.provider = null
		const response = await render()
		expect(response.status).toBe(302)
		expect(response.headers.get("location")).toBe("/SignInPage")
	})

	it("sends a new account without a provider workspace to onboarding", async () => {
		state.provider = null
		const response = await render()
		expect(response.status).toBe(302)
		expect(response.headers.get("location")).toContain("/provider/")
	})

	it("renders an active tour workspace with its selected product and departure on deep links", async () => {
		const response = await render("scope=tour&productId=tour-1&variantId=departure-1")
		const html = (await response.text()).replaceAll("&#38;", "&").replaceAll("&amp;", "&")

		expect(response.status).toBe(200)
		expect(html).toContain("Experiencia · Tour de prueba")
		expect(html).toContain("Gestiona salidas, presentaciones, vouchers, pagos y cancelaciones")
		expect(html).toContain(
			'href="/booking/day-of?scope=tour&productId=tour-1&variantId=departure-1"'
		)
		expect(html).toContain(
			'href="/rates/calendar?scope=tour&productId=tour-1&variantId=departure-1&focus=availability"'
		)
		expect(html).not.toContain("Huésped ·")
	})

	it("keeps a mixed provider in the requested business line and offers an explicit all-lines view", async () => {
		state.productTypes = ["Tour", "Hotel"]
		state.lines = ["lodging", "tour"]
		const tourHtml = await (await render("scope=tour&productId=tour-1")).text()
		expect(tourHtml).toContain("Experiencia · Tour de prueba")
		expect(tourHtml).toContain("Salidas de hoy")

		const allHtml = (await (await render("scope=all")).text())
			.replaceAll("&#38;", "&")
			.replaceAll("&amp;", "&")
		expect(allHtml).toContain('href="/booking?scope=tour&vista=today"')
		expect(allHtml).not.toContain("otra prueba de tour")
	})

	it("uses accommodation language and does not expose tour-only actions to a hotel provider", async () => {
		state.productTypes = ["Hotel"]
		state.lines = ["lodging"]
		const response = await render("scope=hotel&productId=hotel-1")
		const html = await response.text()

		expect(response.status).toBe(200)
		expect(html).toContain("Alojamiento · Alojamiento de prueba")
		expect(html).not.toContain("Salidas de hoy")
		expect(html).not.toContain("Solicitudes privadas")
	})

	it.each(["scope=hotel&productId=tour-1", "scope=all&productId=tour-1", "scope=airline"])(
		"rejects a contradictory or unsupported deep-link context: %s",
		async (query) => {
			const response = await render(query)
			expect(response.status).toBe(400)
			expect(await response.text()).toContain("Revisa el negocio seleccionado")
		}
	)

	it("rejects foreign products, unknown departures and departures from another product", async () => {
		expect((await render("productId=foreign")).status).toBe(404)
		expect((await render("variantId=unknown")).status).toBe(404)
		expect((await render("productId=hotel-1&variantId=departure-1")).status).toBe(404)
	})
})
