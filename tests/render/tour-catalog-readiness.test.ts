import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it, vi } from "vitest"
import { buildTourDiagnostic, type TourObservations } from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"

const mocks = vi.hoisted(() => ({ preparation: vi.fn() }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/layouts/WorkspaceLayout.astro", async () => import("@/components/ui/Card.astro"))
vi.mock("@/lib/catalog/providerCatalogSummary", () => ({
	getProviderCatalogSummary: async () => ({
		products: [
			{
				id: "tour",
				name: "Tour fixture",
				status: { state: "ready", label: "Listo", variant: "success" },
			},
		],
		summary: { total: 1, ready: 1, published: 0, draft: 0 },
	}),
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
		expect(html).toContain(`aria-valuenow="${conditionsReady ? 100 : 90}"`)
		// Assert the actual rendered metric, not just the projection feeding it.
		expect(html).toMatch(
			new RegExp(`Listos para publicar</p>\\s*<p[^>]*>\\s*${conditionsReady ? 1 : 0}\\s*</p>`)
		)
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
	expect(html).toContain("El viajero puede solicitar una cotización")
	expect(html).not.toContain("disponibilidad actual pendiente")
	expect(html).not.toContain("Revisar disponibilidad")
	expect(html).toContain("Revisar ficha")
})
