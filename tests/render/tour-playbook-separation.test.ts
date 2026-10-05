import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it, vi } from "vitest"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"

vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: async () => ({
		status: "resolved",
		productId: "tour",
		variantId: "option",
		ratePlanId: "rate",
		options: [],
		option: { name: "Salida guardada" },
	}),
}))
vi.mock("@/lib/playbook/evaluate-tour-launch-progress", () => ({
	evaluateTourLaunchProgress: async () => ({
		progress: { progressPercent: 100 },
		tourPresentation: presentTourDiagnostic(tourDiagnosticFixture(), {
			published: false,
			previewHref: "/product/tour/preview",
		}),
	}),
}))
vi.mock("@/lib/playbook/evaluate-complete-to-publish-progress", () => ({
	evaluateCompleteToPublishProgress: async () => ({
		tourPresentation: presentTourDiagnostic(tourDiagnosticFixture(), {
			published: false,
			previewHref: "/product/tour/preview",
		}),
	}),
}))
import PlaybookLayout from "@/layouts/PlaybookLayout.astro"
import Editor from "@/components/tours/TourSlotProfileEditor.astro"

async function render(part: "prepare" | "publish") {
	const container = await AstroContainer.create()
	return container.renderToString(PlaybookLayout, {
		request: new Request(
			`https://fastt.test/product/tour/departures/option?playbook=${part === "prepare" ? "launch-tour" : "complete-to-publish"}&step=departure&tourFlowVersion=2&variantId=option&ratePlanId=rate&returnTo=%2Fproduct%2Ftour%2Fpreview`
		),
		props: {
			active: true,
			playbookId: part === "prepare" ? "launch-tour" : "complete-to-publish",
			stepId: "departure",
			productId: "tour",
			variantId: "option",
			ratePlanId: "rate",
			productDisplayName: "Tour guardado",
			playbookVertical: "tour",
			isHotel: false,
			continueFormId: "slotForm",
		},
		slots: { default: '<form id="slotForm"><h1>Editar salida</h1></form>' },
	})
}
describe("two tour playbooks rendered in their actual layout", () => {
	it("A shows only its five folded stages and preserves the review return on stage links", async () => {
		const html = await render("prepare")
		expect(html).toContain("Preparar tour")
		expect(html).toContain("Etapa 4 de 5 - Primera opción, precio y condiciones")
		expect(html).not.toContain("Ver etapas")
		expect(html.match(/data-tour-stage-id=/g)).toHaveLength(5)
		expect(html).not.toMatch(/<details[^>]*open/)
		expect(html).not.toContain("data-tour-publication-correction")
		expect(html).not.toContain("comprobaciones cumplidas")
		expect(html).toMatch(/class="tour-stage-rail__link" href="[^"]*returnTo=/)
	})
	it("B mounts only the correction and returns to publication, never to the next stage", async () => {
		const html = await render("publish")
		expect(html).toContain("Publicar tour")
		expect(html).toContain("data-tour-publication-correction")
		expect(html).toContain("Guardar y volver")
		expect(html).not.toContain("Dejar para más tarde")
		expect(html).toContain("Volver a publicación")
		expect(html).not.toContain("data-tour-stage-id")
		expect(html).not.toContain("Ver etapas")
		expect(html).not.toContain("comprobaciones cumplidas")
	})
	it("does not fabricate saved profile fields when an existing option has no profile", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Editor, {
			props: {
				productId: "tour",
				variantId: "option",
				mode: "edit",
				departureTime: "",
				maxPax: null,
				languageCode: "",
				bookingMode: null,
			},
		})
		expect(html).toMatch(/name="maxPax"[^>]*value(?:="")?(?:\s|>)/)
		expect(html).toContain("Selecciona un idioma")
		expect(html).toContain("Selecciona una modalidad")
		expect(html).not.toContain('value="09:00"')
	})
})
