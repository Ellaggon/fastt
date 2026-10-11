import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Fields from "@/components/tours/TourSubtypePlaybookFields.astro"
import {
	getTourPublishingStage,
	projectTourPublishingStages,
} from "@/lib/playbook/tour-publishing-stages"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { projectTourLogisticsObservation } from "@/lib/tours/tourPreparationRequirements"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"
import {
	EXPERIENCE_FORMATS,
	experienceProgramMinimum,
	experienceProgramLines,
} from "@/shared/domain/experience-format"

describe("experience format throughout preparation and publication", () => {
	it("preserves commas within a moment instead of counting punctuation as stops", () => {
		expect(experienceProgramLines("  Inicio, práctica y cierre  \n\n Preguntas ")).toEqual([
			"Inicio, práctica y cierre",
			"Preguntas",
		])
	})
	it.each([...EXPERIENCE_FORMATS, null])(
		"renders the same five stages and program minimum for %s",
		async (format) => {
			const diagnosis = tourDiagnosticFixture()
			diagnosis.context.experienceFormat = format
			const selection = structuredClone(diagnosis.context.selection)
			const stages = projectTourPublishingStages(diagnosis)
			expect(stages.map((stage) => stage.id)).toEqual([
				"presentation",
				"logistics",
				"location",
				"photos",
				"participants",
			])
			expect(getTourPublishingStage("subtype", format).label).toBe(stages[1].label)
			expect(stages[1].label).toBe(
				format === "guided_tour" ? "Itinerario y logística" : "Programa y detalles"
			)
			expect(stages[2].label).toBe(
				format === "guided_tour" ? "Ubicación y encuentro" : "Lugar e indicaciones"
			)
			expect(stages[1].href).toContain("/product/tour/subtype")
			expect(stages[1].href).toContain("variantId=option")
			expect(stages[1].href).toContain("ratePlanId=rate")
			const minimum = experienceProgramMinimum(format)
			const container = await AstroContainer.create()
			const html = await container.renderToString(Fields, {
				props: {
					productId: "tour",
					tourSubtype: {
						experienceFormat: format,
						itineraryJson: [{ description: "Contenido guardado" }],
					},
				},
			})
			expect(html).toContain(`mínimo ${minimum} ${minimum === 1 ? "momento" : "momentos"}`)
			expect(html).toContain("Contenido guardado")
			expect(html.includes('name="guideType"')).toBe(format == null || format === "guided_tour")
			expect(html.includes('name="pickupDefaultArea"')).toBe(
				format == null || format === "guided_tour"
			)
			expect(html).toContain('name="expectedExperienceFormat"')
			if (format && format !== "guided_tour")
				expect(html).not.toContain("Recorrido por el centro histórico")
			expect(diagnosis.context.selection).toEqual(selection)
		}
	)
	it("keeps a class program correction separate from authorization and preserves its offer", () => {
		const diagnosis = tourDiagnosticFixture()
		diagnosis.context.experienceFormat = "class"
		const observation = projectTourLogisticsObservation(
			[{ sectionKey: "itinerary", complete: false, detail: "Completa un momento" }],
			"tour",
			{ variantId: "option", ratePlanId: "rate" },
			"class"
		)
		diagnosis.requirements.logistics.result = {
			state: "pending",
			reason: { code: "missing_program", message: observation.message },
			responsible: "provider",
			action: observation.action!,
		}
		const view = presentTourDiagnostic(diagnosis, { previewHref: "/product/tour/preview" })
		expect(view.primaryAction.label).toBe("Completar programa")
		expect(view.primaryAction.href).toContain("variantId=option")
		expect(view.preparationRequirements.find((row) => row.id === "logistics")?.label).toBe(
			"Programa y detalles"
		)
		diagnosis.requirements.logistics.result = {
			state: "ready",
			evidence: { source: "test", reference: "program" },
		}
		diagnosis.requirements.experience_authorization.result = {
			state: "blocked",
			reason: { code: "in_review", message: "En revisión" },
			responsible: "fastt",
			action: {
				label: "Consultar revisión",
				href: "/provider/settings/verification?line=tour&experience=tour",
			},
		}
		const prepared = presentTourDiagnostic(diagnosis, { previewHref: "/product/tour/preview" })
		expect(prepared.preparation.complete).toBe(true)
		expect(prepared.catalogStatus.readyToPublish).toBe(false)
	})
})
