import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(resolve(root, path), "utf8")

describe("tour wizard browser and routing contract", () => {
	it("keeps a progressive native POST fallback without leaving the user on an API URL", () => {
		const page = source("src/pages/product/create.astro")
		const api = source("src/pages/api/product/create.ts")
		expect(page).toMatch(/name="_response"\s+value="redirect"/)
		expect(page).toContain('fd.set("_response", "json")')
		expect(page).toContain('document.addEventListener("astro:page-load", initCreateForm)')
		expect(api).toContain("status: 303")
		expect(api).toContain("Location: nextPath")
	})

	it("never degrades the image step from tour to accommodation", () => {
		const handler = source("src/lib/forms/productImagesHandler.ts")
		expect(handler).toContain("resolvePlaybookRedirectAfterSave")
		expect(handler).toContain('launchStep: "subtype"')
		const nav = source("src/lib/playbook/playbook-nav.ts")
		expect(nav).toContain("isTourLaunchPlaybookMode")
		expect(nav).toContain("buildTourPlaybookHref")
	})

	it("has a Tour-specific progress, conditions and publish path", () => {
		const layout = source("src/layouts/PlaybookLayout.astro")
		const playbook = source("src/lib/playbook/launch-tour.ts")
		const preview = source("src/pages/product/[id]/preview.astro")
		expect(layout).toContain("evaluateTourLaunchProgress")
		expect(layout).not.toContain("applyTourPublishingStage")
		expect(layout).toContain("if (isTourPublication)")
		expect(layout).toContain("normalizeCompleteToPublishStep")
		expect(layout).toContain("Etapa ${stagePosition} de ${stageTotal}")
		expect(layout).toContain("showPlaybookProductContext")
		expect(layout).toContain("getProductFullAggregate")
		expect(layout).not.toContain("TourPreparationChecks")
		expect(layout).toContain("isTourPublication")
		expect(layout).not.toContain("verification-wizard-progress-label--alternate")
		expect(layout).not.toContain("tour-preparation-disclosure.client.ts")
		expect(layout).toContain("showProgress && !lightweight && !isTourLaunch")
		expect(playbook).toContain('id: "conditions"')
		expect(preview).toContain("Publicar {vertical.labels.singular}")
	})

	it("collects operational questions in the shared tour form", () => {
		const questionsApi = source("src/pages/api/tours/booking-questions.ts")
		const conditions = source("src/pages/rates/plans/[ratePlanId].astro")
		const questions = source("src/components/tours/TourBookingQuestions.astro")
		expect(questionsApi).toContain("TourBookingQuestion")
		expect(conditions).toContain("TourBookingQuestions")
		expect(questions).toContain("Preguntas al reservar")
		expect(questions).toContain("todas las opciones y")
		expect(questions).toContain("tarifas del tour")
		expect(questions).toContain("los cambios afectan reservas nuevas")
		expect(questions).toContain("createTourBookingQuestionsEditor")
		expect(questions).toContain("Guardar preguntas")
		expect(questions).not.toContain("Se aplican al confirmar este paso.")
	})

	it("keeps policy detours inside the tour playbook and treats availability as the next step", () => {
		const surface = source("src/components/policy/RatePlanPoliciesSurface.astro")
		const flow = source("src/components/policy/PolicyAssignmentFlow.astro")
		const departure = source("src/pages/product/[id]/departures/[slotId]/index.astro")

		expect(surface).toContain('target.searchParams.set("returnTo", currentPath)')
		expect(surface).toContain('Astro.url.searchParams.get("step") || step')
		expect(surface).toContain("availabilityIsNextStep={isTour && playbookMode}")
		expect(flow).toContain("bindAssignmentSurface")
		expect(flow).toContain(
			'document.addEventListener("astro:page-load", () => bindAssignmentSurface())'
		)
		expect(departure).toContain("safeConditionsReturn")
		expect(departure).toContain("lightweight: true")
		expect(departure).toContain("playbook.active ? PlaybookLayout : WorkspaceLayout")
		expect(departure).toContain('"Guardar y volver a condiciones"')
	})
})
