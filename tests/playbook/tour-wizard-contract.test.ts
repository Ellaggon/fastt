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
		expect(layout).toContain("applyTourPublishingStage")
		expect(layout).toContain("normalizeCompleteToPublishStep")
		expect(layout).toContain("Etapa ${stagePosition} de ${stageTotal} · ${stageLabel}")
		expect(layout).toContain("stageProgressPercent")
		expect(layout).toContain("Math.max(progressPercent, stageProgressPercent)")
		expect(layout).not.toMatch(
			/Etapa \{stagePosition\}[\s\S]*Paso \{stepNumber\} de \{totalSteps\}/
		)
		expect(playbook).toContain('id: "conditions"')
		expect(preview).toContain("Publicar {vertical.labels.singular}")
	})

	it("collects operational questions and surfaces conditional compliance", () => {
		const questionsApi = source("src/pages/api/tours/booking-questions.ts")
		const conditions = source("src/pages/rates/plans/[ratePlanId].astro")
		const registry = source("src/lib/catalog/productVerticalRegistry.ts")
		expect(questionsApi).toContain("TourBookingQuestion")
		expect(conditions).toContain("Preguntas al reservar")
		expect(conditions).not.toContain("Se aplican al confirmar este paso.")
		expect(conditions).toContain("persistTourQuestions")
		expect(conditions).toContain("fastt-playbook-footer")
		expect(conditions).not.toContain("Guardar preguntas")
		expect(conditions).toContain("Revisar licencias y seguro")
		expect(conditions).toContain("complianceReviewHref")
		expect(conditions).toContain('target.searchParams.set("returnTo", returnTo)')
		expect(conditions).toContain('target.searchParams.set("playbookVertical", "tour")')
		const documents = source("src/pages/provider/settings/verification/documents.astro")
		expect(documents).toContain("safeRatePlanPlaybookReturn")
		expect(documents).toContain("Volver a condiciones")
		expect(documents).toContain("hideFooter")
		expect(conditions).toContain("embeddedGuidedSection")
		expect(conditions).toContain("Contrato comercial")
		expect(conditions).toContain("Bloque 3 · Cumplimiento")
		expect(registry).toMatch(/"rate",\s+"bookingPolicies",\s+"calendar"/)
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
