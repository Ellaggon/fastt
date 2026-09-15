import { describe, expect, it } from "vitest"
import {
	isPreparationPlaybookId,
	isPreparationVertical,
	normalizePreparationPath,
} from "@/lib/onboarding/preparationSession"
import {
	getLaunchLikeStage,
	resolveLaunchPlaybookDefinition,
} from "@/lib/playbook/launch-playbook-definition"
import { getPreviousLaunchStep } from "@/lib/playbook/launch-accommodation"
import { getPreviousTourLaunchStep } from "@/lib/playbook/launch-tour"

describe("persistent preparation session contract", () => {
	it("accepts only owned product preparation destinations", () => {
		expect(normalizePreparationPath("/product/p1/content?playbook=launch&step=content")).toBe(
			"/product/p1/content?playbook=launch&step=content"
		)
		expect(normalizePreparationPath("/rates/calendar?variantId=v1")).toBe(
			"/rates/calendar?variantId=v1"
		)
		expect(normalizePreparationPath("https://example.test/product/p1")).toBeNull()
		expect(normalizePreparationPath("/provider/settings")).toBeNull()
		expect(isPreparationPlaybookId("launch-tour")).toBe(true)
		expect(isPreparationPlaybookId("complete-to-publish")).toBe(false)
		expect(isPreparationVertical("hotel")).toBe(true)
		expect(isPreparationVertical("rental")).toBe(false)
	})

	it("groups the hotel and tour eleven-step flows into three stages", () => {
		const hotel = resolveLaunchPlaybookDefinition("launch", {
			productId: "hotel-1",
			isHotel: true,
		})
		const tour = resolveLaunchPlaybookDefinition("launch-tour", {
			productId: "tour-1",
			isHotel: false,
		})
		expect(getLaunchLikeStage(hotel, "content")).toMatchObject({
			position: 1,
			label: "Tu alojamiento",
		})
		expect(getLaunchLikeStage(hotel, "rate")).toMatchObject({
			position: 2,
			label: "Habitaciones y venta",
		})
		expect(getLaunchLikeStage(tour, "departure")).toMatchObject({
			position: 2,
			label: "Salidas y venta",
		})
		expect(getLaunchLikeStage(tour, "preview")).toMatchObject({
			position: 3,
			label: "Revisión y publicación",
		})
	})

	it("keeps product, variant and rate context in deep links and backward navigation", () => {
		const hotelContext = {
			productId: "hotel-1",
			isHotel: true,
			variantId: "room-1",
			ratePlanId: "rate-1",
		}
		const hotelPrevious = getPreviousLaunchStep("calendar", hotelContext)
		expect(hotelPrevious?.buildHref(hotelContext)).toContain("variantId=room-1")
		expect(hotelPrevious?.buildHref(hotelContext)).toContain("rate-1")

		const tourContext = { productId: "tour-1", variantId: "slot-1", ratePlanId: "tour-rate-1" }
		const tourPrevious = getPreviousTourLaunchStep("calendar")
		expect(tourPrevious?.buildHref(tourContext)).toContain("variantId=slot-1")
		expect(tourPrevious?.buildHref(tourContext)).toContain("tour-rate-1")
	})
})
