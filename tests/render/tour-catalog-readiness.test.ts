import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it, vi } from "vitest"
import { buildTourDiagnostic, type TourObservations } from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"

const mocks = vi.hoisted(() => ({
	preparation: vi.fn(),
	catalogReadFails: false,
	catalogProducts: [
		{
			id: "tour",
			name: "Tour fixture",
			publicationState: "ready",
			optionCount: 3,
		},
	] as Array<{ id: string; name: string; publicationState: string; optionCount: number }>,
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/layouts/WorkspaceLayout.astro", async () => import("@/components/ui/Card.astro"))
vi.mock("@/lib/catalog/providerTourCatalog", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/catalog/providerTourCatalog")>()),
	listProviderTourCatalog: async () => {
		if (mocks.catalogReadFails) throw new Error("database unavailable")
		return {
			products: mocks.catalogProducts,
			counts: { total: 1, published: 0, draft: 1 },
			filteredTotal: 1,
			page: 1,
			pageCount: 1,
		}
	},
}))
vi.mock("@/lib/playbook/summarize-product-preparation", () => ({
	summarizeProductPreparation: mocks.preparation,
}))
import ToursCatalog from "@/pages/catalog/tours.astro"

it.each([false, true])(
	"renders current readiness instead of stored ready (conditions ready: %s)",
	async (conditionsReady) => {
		const context = resolveTourCommercialContext({
			productId: "tour",
			options: [
				{
					variantId: "option",
					name: "Salida",
					bookingMode: "shared",
					lifecycleState: "ready",
					salesEnabled: true,
					hasProfile: true,
					hasCapacity: true,
					rates: [{ ratePlanId: "rate", name: "Tarifa", isActive: true, isDefault: true }],
				},
			],
		})
		const observations = Object.fromEntries(
			Object.keys(TOUR_REQUIREMENTS).map((id) => [
				id,
				{
					ready: id !== "conditions" || conditionsReady,
					message: "Condición histórica incompatible",
				},
			])
		) as TourObservations
		const diagnostic = buildTourDiagnostic({
			providerId: "provider",
			productId: "tour",
			context,
			observations,
		})
		const presentation = presentTourDiagnostic(diagnostic, { previewHref: "/product/tour/preview" })
		mocks.preparation.mockResolvedValue({
			isPublished: false,
			continuePreparationHref:
				"/product/tour/content?playbook=launch-tour&step=content&flow=create",
			tourContext: context,
			tourPresentation: presentation,
			readinessPercent: presentation.preparation.readinessPercent,
			nextStepLabel: presentation.nextLabel,
			nextStepBody: presentation.support,
			previewHref: "/product/tour/preview",
		})
		const container = await AstroContainer.create()
		const html = await container.renderToString(ToursCatalog, {
			request: new Request("https://fastt.test/catalog/tours"),
		})
		expect(html).toMatch(/>\s*Borrador\s*</)
		expect(html).not.toMatch(/>\s*Listo\s*</)
		expect(html).not.toContain('role="progressbar"')
		expect(html).not.toContain("Fichas preparadas")
		expect(html).toMatch(
			/href="\/product\/tour\/departures"[^>]*>\s*Opciones y horarios · 3\s*<\/a>/
		)
		expect(html.match(/data-tour-id="tour"/g)).toHaveLength(1)
		if (!conditionsReady) {
			expect(html).toContain("Condición histórica incompatible")
			expect(html).not.toMatch(/>\s*Listo para publicar\s*<\/span>/)
		}
	}
)

it("renders a published private offer without a shared availability warning", async () => {
	const context = resolveTourCommercialContext({
		productId: "tour",
		options: [
			{
				variantId: "option",
				name: "Privada",
				bookingMode: "private",
				lifecycleState: "ready",
				salesEnabled: true,
				hasProfile: true,
				hasCapacity: true,
				rates: [{ ratePlanId: "rate", name: "Tarifa", isActive: true, isDefault: true }],
			},
		],
	})
	const observations = Object.fromEntries(
		Object.keys(TOUR_REQUIREMENTS).map((id) => [
			id,
			{ ready: id !== "current_availability", message: "Sin cupos compartidos" },
		])
	) as TourObservations
	const diagnostic = buildTourDiagnostic({
		providerId: "provider",
		productId: "tour",
		context,
		observations,
	})
	const presentation = presentTourDiagnostic(diagnostic, {
		published: true,
		previewHref: "/product/tour/preview",
	})
	mocks.catalogProducts = [
		{
			id: "tour",
			name: "Tour fixture",
			publicationState: "published",
			optionCount: 1,
		},
	]
	mocks.preparation.mockResolvedValue({
		isPublished: true,
		tourContext: context,
		tourPresentation: presentation,
		readinessPercent: 100,
		nextStepLabel: presentation.nextLabel,
		nextStepBody: presentation.support,
		previewHref: "/product/tour/preview",
	})
	const container = await AstroContainer.create()
	const html = await container.renderToString(ToursCatalog, {
		request: new Request("https://fastt.test/catalog/tours"),
	})
	expect(html).toContain("El viajero puede enviar una solicitud privada")
	expect(html).not.toContain("disponibilidad actual pendiente")
	expect(html).not.toContain("Revisar disponibilidad")
	expect(html).toContain("Revisar ficha")
})

it("reports a failed catalog read without presenting an empty business", async () => {
	mocks.catalogReadFails = true
	try {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ToursCatalog, {
			request: new Request("https://fastt.test/catalog/tours"),
		})
		expect(html).toContain("No pudimos cargar tus tours")
		expect(html).toContain("Reintentar")
		expect(html).not.toContain("Crea tu primer tour")
	} finally {
		mocks.catalogReadFails = false
	}
})
