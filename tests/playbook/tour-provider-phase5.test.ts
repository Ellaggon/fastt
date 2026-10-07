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
import { buildTourCommercialLinks } from "@/lib/tours/tourProviderNavigation"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("tour provider phase 5", () => {
	it("uses the same nine preparation groups for launch and continuation, including the final preview", () => {
		const launch = resolveLaunchPlaybookDefinition("launch-tour", {
			productId: "tour",
			isHotel: false,
		})
		for (const step of launch.steps)
			expect(getLaunchLikeStage(launch, step.id)).toEqual({
				label: getTourPublishingStage(step.id).label,
				position: getTourPublishingStage(step.id).position,
				total: 9,
			})
		const preview = source("src/pages/product/[id]/preview.astro")
		expect(preview).toContain("playbookVertical={vertical.vertical}")
		expect(preview).toContain("variantId={previewVariantId}")
		expect(preview).toContain("ratePlanId={previewRatePlanId}")
	})

	it("groups navigation screens into nine stages without turning substeps into progress", () => {
		expect(TOUR_PUBLISHING_STAGE_COUNT).toBe(9)
		for (const step of ["content", "categories"])
			expect(getTourPublishingStage(step).position).toBe(1)
		expect(getTourPublishingStage("subtype").position).toBe(2)
		expect(getTourPublishingStage("location").position).toBe(3)
		expect(getTourPublishingStage("photos").position).toBe(4)
		for (const [step, position] of [
			["tickets", 5],
			["departure", 6],
			["rate", 7],
			["bookingPolicies", 8],
		] as const)
			expect(getTourPublishingStage(step).position).toBe(position)
		expect(getTourPublishingStage("calendar").position).toBe(9)
		expect(getTourPublishingStage("preview").position).toBe(0)
	})

	it("uses diagnostic stage states without a competing tour progress bar", () => {
		const layout = source("src/layouts/PlaybookLayout.astro")
		expect(layout).toContain("isTourPreparation")
		expect(layout).toContain("progressPercent = progress.progress.progressPercent")
		expect(layout).toContain("stages={tourAttention.stages}")
		expect(layout).not.toContain("tourPublishingProgressPercent")
		expect(layout).toContain("showProgress && !lightweight && !isTourLaunch")
	})

	it("keeps categories in presentation and participants in the commercial stage", () => {
		expect(completeToPublishNextHref("tour-1", "content", "tour")).toBe(
			"/product/tour-1/subtype?playbook=complete-to-publish&step=subtype&flow=complete"
		)
		expect(completeToPublishNextHref("tour-1", "categories", "tour")).toBe(
			"/product/tour-1/subtype?playbook=complete-to-publish&step=subtype&flow=complete"
		)
		expect(completeToPublishNextHref("tour-1", "tickets", "tour")).toBe(
			"/product/tour-1/departures/new?playbook=complete-to-publish&step=departure&flow=complete"
		)
		const participants = source("src/pages/product/[id]/tickets.astro")
		const categories = source("src/pages/product/[id]/categories.astro")
		expect(participants).not.toContain("ProductCategoryLink")
		expect(categories).toContain("tourPresentationCanonicalHref")
		expect(source("src/components/tours/TourPresentationForm.astro")).toContain(
			"TourCategoryChoices"
		)
		expect(categories).not.toContain("Criterios de calidad")
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
		expect(preview).toContain('tourCommercialContext?.status === "resolved"')
		expect(preview).toContain("variantName: tourCommercialContext.option.name")
		expect(preview).toContain("ratePlanName: tourCommercialContext.rate.name")
		const commercialContext = source("src/lib/tours/loadTourCommercialContext.ts")
		expect(commercialContext).toContain("eq(Variant.productId, input.productId)")
		expect(commercialContext).toContain('eq(Variant.kind, "tour_slot")')
		expect(preview).toContain("data-selected-tour-review")
		expect(publicTour).toContain("eq(Product.providerId, previewProviderId)")
		expect(publicTour).toContain("Vista previa privada del proveedor")
		expect(booking).toContain("Reservas desactivadas en vista previa")
	})

	it("explains location and booking-question scope without mixing concepts", () => {
		const location = source("src/pages/product/[id]/location.astro")
		const conditions = source("src/components/tours/TourBookingQuestions.astro")
		expect(location).toContain("Destino y zona pública")
		expect(location).toContain("Punto de encuentro operativo")
		expect(conditions).toContain("Preguntas al reservar")
		expect(conditions).toContain("todas las opciones y tarifas")
		expect(conditions).toContain('name="customRequired"')
	})

	it("uses independent selected-offer observations rather than aggregate departure counters", () => {
		const readiness = source("src/lib/playbook/evaluate-complete-to-publish-progress.ts")
		expect(readiness).toContain("buildTourDiagnostic")
		expect(readiness).toContain("commercial?.observations.availableDateCount")
		expect(readiness).toContain("commercial?.observations.priceReady")
		expect(readiness).toContain("summarizeTourDiagnostic(tourDiagnostic).preparation")
	})
	it("does not offer guided activation while provider governance blocks publishing", () => {
		const workspace = source("src/components/rates/SingleCalendarWorkspace.tsx")
		expect(workspace).toContain("calendarContinueState")
		const review = source("src/components/tours/TourReviewStatus.astro")
		expect(review).toContain("presentation.activation.allowed")
		expect(review).toContain("Activar oferta")
	})
})
