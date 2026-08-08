import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
	TOUR_QUALITY_MIN_IMAGES,
	TOUR_QUALITY_MIN_ITINERARY_STEPS,
	scoreTourQuality,
} from "@/lib/tours/tourAdminQuality"

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tour P2 trust + quality floors", () => {
	it("keeps migration contracts for reviews, private requests, marketplace events", () => {
		const migration = read("db/migrations/2026-08-20_tour_p2_trust_quality_private.sql")
		expect(migration).toContain("ProductReview")
		expect(migration).toContain("bookingId")
		expect(migration).toContain("TourPrivateRequest")
		expect(migration).toContain("MarketplaceEvent")
	})

	it("blocks publish below photo/itinerary floors and separates warnings", () => {
		expect(TOUR_QUALITY_MIN_IMAGES).toBe(5)
		expect(TOUR_QUALITY_MIN_ITINERARY_STEPS).toBe(3)
		const mid = scoreTourQuality({
			status: "draft",
			imageCount: 4,
			itinerarySteps: 2,
			hasMeetingPoint: true,
			hasDurationMinutes: true,
			hasIncludes: true,
			categoryCount: 1,
			activeTicketCount: 1,
			activeSalidaCount: 1,
			completeSalidaCount: 1,
		})
		expect(mid.blockers).toContain("missing_images")
		expect(mid.blockers).toContain("thin_itinerary")
		expect(mid.warnings).toContain("draft_status")
	})
})
