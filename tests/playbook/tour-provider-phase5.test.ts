import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { completeToPublishNextHref } from "@/lib/playbook/complete-to-publish"
import { TOUR_LAUNCH_STEPS } from "@/lib/playbook/launch-tour"
import {
	countCompletedTourPublishingStages,
	getTourPublishingStage,
	tourPublishingProgressPercent,
	TOUR_PUBLISHING_STAGE_COUNT,
} from "@/lib/playbook/tour-publishing-stages"
import { tourActivityQualityCriteria } from "@/lib/tours/tourActivityQuality"
import { buildTourCommercialLinks } from "@/lib/tours/tourProviderNavigation"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("tour provider phase 5", () => {
	it("gives each tour screen its own stage in the order the provider walks them", () => {
		expect(TOUR_PUBLISHING_STAGE_COUNT).toBe(11)
		expect(getTourPublishingStage("content")).toMatchObject({ position: 1, label: "Identidad" })
		expect(getTourPublishingStage("photos")).toMatchObject({ position: 2, label: "Fotos" })
		expect(getTourPublishingStage("location")).toMatchObject({ position: 3, label: "Destino" })
		expect(getTourPublishingStage("subtype")).toMatchObject({
			position: 4,
			label: "Itinerario y detalles",
		})
		expect(getTourPublishingStage("tickets")).toMatchObject({ position: 5, label: "Participantes" })
		expect(getTourPublishingStage("categories")).toMatchObject({
			position: 6,
			label: "Participantes y búsqueda",
		})
		expect(getTourPublishingStage("departure")).toMatchObject({ position: 7, label: "Salida" })
		expect(getTourPublishingStage("rate")).toMatchObject({ position: 8, label: "Precio" })
		expect(getTourPublishingStage("bookingPolicies")).toMatchObject({
			position: 9,
			label: "Condiciones de reserva",
		})
		expect(getTourPublishingStage("calendar")).toMatchObject({
			position: 10,
			label: "Disponibilidad",
		})
		expect(getTourPublishingStage("preview")).toMatchObject({
			position: 11,
			label: "Revisión y publicación",
		})
		expect(getTourPublishingStage("rate").position).toBeGreaterThan(
			getTourPublishingStage("departure").position
		)
		expect(getTourPublishingStage("bookingPolicies").position).toBeGreaterThan(
			getTourPublishingStage("rate").position
		)
		expect(getTourPublishingStage("calendar").position).toBeGreaterThan(
			getTourPublishingStage("bookingPolicies").position
		)
	})

	it("aligns the progress bar with completed tour stages, not checklist noise", () => {
		expect(countCompletedTourPublishingStages(["content", "photos", "location"])).toBe(3)
		expect(
			tourPublishingProgressPercent({
				completedSectionKeys: ["content", "photos", "location", "subtype", "itinerary", "tickets"],
			})
		).toBe(45)
		expect(tourPublishingProgressPercent({ currentStepId: "rate" })).toBe(64)
		expect(tourPublishingProgressPercent({ currentStepId: "bookingPolicies" })).toBe(73)
		const layout = source("src/layouts/PlaybookLayout.astro")
		expect(layout).toContain("tourPublishingProgressPercent")
		expect(layout).toContain("completeTourCompletedSectionKeys")
		expect(layout).toContain("!lightweight || isTourCompletePlaybook")
	})

	it("keeps participants and discovery categories as consecutive independent tasks", () => {
		expect(completeToPublishNextHref("tour-1", "tickets", "tour")).toBe(
			"/product/tour-1/categories?playbook=complete-to-publish&step=categories&flow=complete"
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
		expect(preview).toContain("Corregir ${nextBlocker.label}")
		expect(preview).toContain("?preview=provider")
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

	it("accepts one complete active departure as sufficient publication inventory", () => {
		const readiness = source("src/lib/playbook/evaluate-complete-to-publish-progress.ts")
		expect(readiness).toContain("Number(tourReadiness?.activeSlotCount ?? 0) > 0")
		expect(readiness).toContain("Number(tourReadiness?.completeSlotCount ?? 0) > 0")
		expect(readiness).toContain("tourCommercialContext")
		expect(readiness).toContain("primarySlotId")
		expect(readiness).toContain("completeToPublishStepHref")
	})
})
