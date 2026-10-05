import {
	getLaunchLikeStage,
	resolveLaunchPlaybookDefinition,
} from "@/lib/playbook/launch-playbook-definition"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { completeToPublishNextHref } from "@/lib/playbook/complete-to-publish"
import { TOUR_LAUNCH_STEPS } from "@/lib/playbook/launch-tour"
import {
	getTourPublishingStage,
	TOUR_PUBLISHING_STAGE_COUNT,
} from "@/lib/playbook/tour-publishing-stages"
import { tourActivityQualityCriteria } from "@/lib/tours/tourActivityQuality"
import { buildTourCommercialLinks } from "@/lib/tours/tourProviderNavigation"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("tour provider phase 5", () => {
	it("uses the same six groups for launch and continuation, including the final preview", () => {
		const launch = resolveLaunchPlaybookDefinition("launch-tour", {
			productId: "tour",
			isHotel: false,
		})
		for (const step of launch.steps)
			expect(getLaunchLikeStage(launch, step.id)).toEqual({
				label: getTourPublishingStage(step.id).label,
				position: getTourPublishingStage(step.id).position,
				total: 6,
			})
		const preview = source("src/pages/product/[id]/preview.astro")
		expect(preview).toContain("playbookVertical={vertical.vertical}")
		expect(preview).toContain("variantId={previewVariantId}")
		expect(preview).toContain("ratePlanId={previewRatePlanId}")
	})

	it("groups navigation screens into six stages without turning substeps into progress", () => {
		expect(TOUR_PUBLISHING_STAGE_COUNT).toBe(6)
		for (const step of ["content", "categories"])
			expect(getTourPublishingStage(step).position).toBe(1)
		for (const step of ["location", "subtype"])
			expect(getTourPublishingStage(step).position).toBe(2)
		expect(getTourPublishingStage("photos").position).toBe(3)
		for (const step of ["tickets", "departure", "rate", "bookingPolicies"])
			expect(getTourPublishingStage(step).position).toBe(4)
		expect(getTourPublishingStage("calendar").position).toBe(5)
		expect(getTourPublishingStage("preview").position).toBe(6)
	})

	it("uses diagnostic preparation rather than visited stages in the progress bar", () => {
		const layout = source("src/layouts/PlaybookLayout.astro")
		expect(layout).toContain("isTourCompletePlaybook || isTourLaunch")
		expect(layout).toContain("progressPercent = progress.progress.progressPercent")
		expect(layout).toContain("preparation={tourAttention.preparation}")
		expect(layout).not.toContain("tourPublishingProgressPercent")
		expect(layout).toContain("!lightweight || isTourCompletePlaybook")
	})

	it("keeps participants and discovery categories as consecutive independent tasks", () => {
		expect(completeToPublishNextHref("tour-1", "content", "tour")).toBe(
			"/product/tour-1/categories?playbook=complete-to-publish&step=categories&flow=complete"
		)
		expect(completeToPublishNextHref("tour-1", "categories", "tour")).toBe(
			"/product/tour-1/location?playbook=complete-to-publish&step=location&flow=complete"
		)
		expect(completeToPublishNextHref("tour-1", "tickets", "tour")).toBe(
			"/product/tour-1/departures/new?playbook=complete-to-publish&step=departure&flow=complete"
		)
		const participants = source("src/pages/product/[id]/tickets.astro")
		const categories = source("src/pages/product/[id]/categories.astro")
		expect(participants).not.toContain("ProductCategoryLink")
		expect(categories).toContain("representan tipos de")
	})

	it("keeps product, departure and rate in direct commercial editing links", () => {
		const links = buildTourCommercialLinks({
			productId: "tour-1",
			variantId: "departure-1",
			ratePlanId: "rate-1",
		})
		expect(links.priceHref).toContain("/rates/plans/rate-1")
		expect(links.priceHref).toContain("productId=tour-1")
		expect(links.priceHref).toContain("variantId=departure-1")
		expect(links.calendarHref).toContain("ratePlanId=rate-1")

		const launchCalendar = TOUR_LAUNCH_STEPS.find((step) => step.id === "calendar")?.buildHref({
			productId: "tour-1",
			variantId: "departure-1",
			ratePlanId: "rate-1",
		})
		expect(launchCalendar).toContain("productId=tour-1")
		expect(launchCalendar).toContain("variantId=departure-1")
		expect(launchCalendar).toContain("ratePlanId=rate-1")
	})

	it("makes the catalog task-oriented and resumes the exact missing requirement", () => {
		const catalog = source("src/pages/catalog/tours.astro")
		expect(catalog).toContain("Qué necesita atención")
		expect(catalog).toContain("preparation.nextStepLabel")
		expect(catalog).toContain("continuePreparationHref")
		expect(catalog).toContain("links.priceHref")
		expect(catalog).toContain("links.calendarHref")
	})

	it("uses the actual public tour page for an owner-only non-bookable preview", () => {
		const preview = source("src/pages/product/[id]/preview.astro")
		const publicTour = source("src/pages/tours/[id]/index.astro")
		const booking = source("src/components/tours/TourDepartureSection.astro")
		expect(preview).toContain("data-real-public-preview")
		expect(preview).toContain("!isTour ?")
		expect(preview).toContain('playbookId !== "complete-to-publish"')
		expect(preview).toContain("nextBlocker?.cta")
		expect(preview).toContain("buildTourProviderPreviewHref(productId")
		expect(preview).toContain("realTourPreviewEmbedded")
		expect(preview).toContain("src={realTourPreviewEmbedded}")
		expect(preview).toContain("href={realTourPreviewWithReturn}")
		expect(preview).toContain("ratePlanId: previewRatePlanId")
		expect(preview).toContain("eq(Variant.productId, productId)")
		expect(preview).toContain("eq(RatePlan.id, previewRatePlanId)")
		expect(preview).toContain("data-selected-tour-review")
		expect(publicTour).toContain("eq(Product.providerId, previewProviderId)")
		expect(publicTour).toContain("Vista previa privada del proveedor")
		expect(booking).toContain("Reservas desactivadas en vista previa")
	})

	it("explains location and booking-question scope without mixing concepts", () => {
		const location = source("src/pages/product/[id]/location.astro")
		const conditions = source("src/pages/rates/plans/[ratePlanId].astro")
		expect(location).toContain("Destino y zona pública")
		expect(location).toContain("Punto de encuentro operativo")
		expect(conditions).toContain("Preguntas al reservar")
		expect(conditions).toContain("todas las salidas y tarifas")
		expect(conditions).toContain("tourCustomQuestionRequired")
	})

	it("adds activity-specific quality guidance while retaining universal criteria", () => {
		const food = tourActivityQualityCriteria([{ slug: "tour-gastronomico" }])
		const adventure = tourActivityQualityCriteria([{ name: "Aventura en montaña" }])
		expect(food.map((criterion) => criterion.id)).toContain("dietary-needs")
		expect(adventure.map((criterion) => criterion.id)).toContain("physical-demand")
		expect(food.map((criterion) => criterion.id)).toContain("meeting-instructions")
	})

	it("uses independent selected-offer observations rather than aggregate departure counters", () => {
		const readiness = source("src/lib/playbook/evaluate-complete-to-publish-progress.ts")
		expect(readiness).toContain("buildTourDiagnostic")
		expect(readiness).toContain("commercial?.observations.availableDateCount")
		expect(readiness).toContain("commercial?.observations.priceReady")
		expect(readiness).toContain("summarizeTourDiagnostic(tourDiagnostic).preparation")
	})
	it("does not offer guided activation while provider governance blocks publishing", () => {
		const calendar = source("src/pages/rates/calendar.astro")
		const workspace = source("src/components/rates/SingleCalendarWorkspace.tsx")
		expect(calendar).toContain("loadCompleteToPublishState")
		expect(calendar).toContain("tourActivationDecision(guidedTourState.tourDiagnostic)")
		expect(calendar).toContain("activationBlockers: guidedTourPublishBlockers.map")
		expect(calendar).toContain("href: blocker.href")
		expect(workspace).toContain(
			"activationBlockers?: Array<{ id: string; label: string; href: string }>"
		)
		expect(workspace).toContain("isTourGuidedAvailability && !hasActivationBlockers")
		expect(workspace).toContain("Resolver requisito")
		expect(workspace).toContain('"Activación pendiente"')
		expect(workspace).toContain("Antes de activar esta oferta, resuelve estos requisitos:")
		expect(workspace).toContain("requisitos de activación indicados")
	})
})
