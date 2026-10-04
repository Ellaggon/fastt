import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	productRows: [] as Array<{ productId: string; productType: string }>,
	variants: [] as any[],
	rates: [] as any[],
	diagnostic: null as any,
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialEntryContext: vi.fn().mockResolvedValue(null),
	tourContextEntryResponse: vi.fn(),
}))
vi.mock("@/lib/rates/loadProviderRatePlanVariants", () => ({
	loadProviderRatePlanVariants: vi.fn(async () => mocks.variants),
}))
vi.mock("@/lib/rates/providerRatePlansSurface", () => ({
	buildProviderRatePlansSurface: vi.fn(async () => ({ ratePlans: mocks.rates })),
}))
vi.mock("@/lib/booking/providerOperationalDay", () => ({
	loadProviderOperationalDay: vi
		.fn()
		.mockResolvedValue({ date: "2026-10-04", timezone: "America/La_Paz" }),
	isCalendarDay: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value),
}))
vi.mock("@/lib/playbook/evaluate-complete-to-publish-progress", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	loadCompleteToPublishState: vi.fn(async () => ({
		tourDiagnostic: mocks.diagnostic,
		editorialStatus: "published",
	})),
}))

vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	db: { select: () => ({ from: () => ({ where: () => Promise.resolve(mocks.productRows) }) }) },
}))

import { buildTourDiagnostic, type TourObservations } from "@/lib/tours/buildTourDiagnostic"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import Manage from "@/pages/rates/plans/manage.astro"

async function response(query: string, productId = "tour-1") {
	const container = await AstroContainer.create()
	return container.renderToResponse(Manage, {
		request: new Request(
			`https://fastt.test/rates/plans/manage?${productId ? `productId=${productId}&` : ""}${query}`
		),
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
		mocks.variants = []
		mocks.rates = []
		mocks.diagnostic = null
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

function offer(
	mode: "shared" | "private",
	pending?: "price" | "conditions" | "current_availability"
) {
	mocks.variants = [
		{
			productId: "tour-1",
			productType: "tour",
			productName: "Mi tour",
			variantId: "option-1",
			variantName: "Salida",
			label: "Mi tour · Salida",
		},
		{
			productId: "hotel-1",
			productType: "hotel",
			productName: "Mi hotel",
			variantId: "room-1",
			variantName: "Suite",
			label: "Mi hotel · Suite",
		},
	]
	const row = {
		ratePlanId: "rate-1",
		ratePlanName: "Estándar",
		productId: "tour-1",
		productName: "Mi tour",
		productType: "tour",
		variantId: "option-1",
		variantName: "Salida",
		isActive: true,
		isDefault: true,
		summary: {},
		pricingReadiness: { hasBasePrice: true, basePrice: 100, currency: "BOB" },
		inventoryReadiness: { isReady: false, availableDays: 1, expectedDays: 30 },
		policyCoverage: { coveredCategories: 3, isComplete: true },
		policySummary: "Contrato completo",
	}
	mocks.rates = [
		row,
		{
			...row,
			ratePlanId: "hotel-rate",
			productId: "hotel-1",
			productType: "hotel",
			productName: "Mi hotel",
			variantId: "room-1",
		},
	]
	mocks.diagnostic = buildTourDiagnostic({
		providerId: "provider-1",
		productId: "tour-1",
		context: resolveTourCommercialContext({
			productId: "tour-1",
			options: [
				{
					variantId: "option-1",
					name: "Salida",
					bookingMode: mode,
					lifecycleState: "ready",
					salesEnabled: true,
					hasProfile: true,
					hasCapacity: true,
					rates: [{ ratePlanId: "rate-1", name: "Estándar", isActive: true, isDefault: true }],
				},
			],
		}),
		observations: Object.fromEntries(
			Object.keys(TOUR_REQUIREMENTS).map((id) => [
				id,
				{ ready: id !== pending, message: `Pendiente ${id}` },
			])
		) as TourObservations,
	})
}

describe("tour sidebar pricing destination", () => {
	it("renders tour language and excludes hotel rows and choices from the general entry", async () => {
		offer("shared")
		const result = await response("scope=tour&vista=all", "")
		const html = await result.text()
		expect(result.status).toBe(200)
		expect(html).toContain("Precios y condiciones")
		expect(html).toContain("Selecciona una salida")
		expect(html).not.toContain("Selecciona una habitación")
		expect(html).not.toContain("Mi hotel")
		expect(html).toContain("1 fechas con cupo")
		expect(html).not.toContain("Sin disponibilidad suficiente")
	})
	it.each(["price", "conditions", "current_availability"] as const)(
		"keeps the correct action for %s",
		async (pending) => {
			offer("shared", pending)
			const html = await (await response("scope=tour&vista=all", "")).text()
			const action = mocks.diagnostic.requirements[pending].result.action.href

			expect(html.replaceAll("&amp;", "&").replaceAll("&#38;", "&").includes(action)).toBe(true)
			expect(html).toContain(`Pendiente ${pending}`)
		}
	)
	it("does not show shared capacity requirements for private requests", async () => {
		offer("private", "current_availability")
		const html = await (await response("scope=tour&vista=all", "")).text()
		expect(html).toContain("Solicitudes privadas")
		expect(html).not.toContain("Pendiente current_availability")
	})
})
