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
		expect(handler).toContain('playbook === "launch-tour"')
		expect(handler).toContain('playbook === "launch-tour" ? "launch-tour" : "launch"')
	})

	it("has a Tour-specific progress, conditions and publish path", () => {
		const layout = source("src/layouts/PlaybookLayout.astro")
		const playbook = source("src/lib/playbook/launch-tour.ts")
		const preview = source("src/pages/product/[id]/preview.astro")
		expect(layout).toContain("evaluateTourLaunchProgress")
		expect(playbook).toContain('id: "conditions"')
		expect(preview).toContain("Publicar {vertical.labels.singular}")
	})

	it("collects operational questions and surfaces conditional compliance", () => {
		const questionsApi = source("src/pages/api/tours/booking-questions.ts")
		const conditions = source("src/pages/rates/plans/[ratePlanId].astro")
		const preview = source("src/pages/product/[id]/preview.astro")
		const registry = source("src/lib/catalog/productVerticalRegistry.ts")
		expect(questionsApi).toContain("TourBookingQuestion")
		expect(conditions).toContain("Preguntas necesarias para operar")
		expect(conditions).toContain("Revisar licencias y seguro")
		expect(preview).toContain("Cumplimiento operativo")
		expect(registry).toMatch(/"rate",\s+"bookingPolicies",\s+"calendar"/)
	})
})
