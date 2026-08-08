import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { BookingLineItem, BookingRoomDetail } from "@/shared/infrastructure/db/schema/tables"
import { TOUR_SEMANTICS } from "@/lib/tours/tourSemantics"
import {
	scoreTourQuality,
	tourPublicationValidationErrors,
} from "@/lib/tours/tourAdminQuality"
import { deriveBookingLifecycle } from "@/modules/booking/public"
import { getVerticalOpsVocabulary } from "@/lib/verticalVocabulary"

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tour ops clarity (fase 6)", () => {
	it("aliases BookingLineItem to BookingRoomDetail without physical rename", () => {
		expect(BookingLineItem).toBe(BookingRoomDetail)
		expect(TOUR_SEMANTICS.bookingLineItemTable).toBe("BookingRoomDetail")
		expect(TOUR_SEMANTICS.bookingLineItemAlias).toBe("BookingLineItem")

		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain("export const BookingLineItem = BookingRoomDetail")
		expect(tables).not.toMatch(/pgTable\(\s*"BookingLineItem"/)
		expect(tables).toContain("Deprecated / unused localization table")
	})

	it("uses tour ops vocabulary for lifecycle and finance labels", () => {
		const tourOps = getVerticalOpsVocabulary("Tour")
		expect(tourOps.upcomingState).toBe("Próxima salida")
		expect(tourOps.confirmArrivalAction).toBe("Registrar presentación")
		expect(tourOps.guest).toBe("participante")
		expect(tourOps.financeGrossSourceLabel).toContain("BookingLineItem")

		const hotel = deriveBookingLifecycle({
			status: "confirmed",
			operationalStatus: "pending_arrival",
			checkIn: "2999-01-01",
			checkOut: "2999-01-02",
			productType: "Hotel",
		})
		expect(hotel.label).toBe("Próxima llegada")

		const tour = deriveBookingLifecycle({
			status: "confirmed",
			operationalStatus: "pending_arrival",
			checkIn: "2999-01-01",
			checkOut: "2999-01-02",
			productType: "Tour",
		})
		expect(tour.label).toBe("Próxima salida")
	})

	it("scores tour admin quality and wires the queue surface", () => {
		const weak = scoreTourQuality({
			status: "draft",
			imageCount: 0,
			itinerarySteps: 0,
			hasMeetingPoint: false,
			hasDurationMinutes: false,
			hasIncludes: false,
			categoryCount: 0,
			activeTicketCount: 0,
			activeSalidaCount: 0,
			completeSalidaCount: 0,
		})
		expect(weak.score).toBeLessThan(50)
		expect(weak.issues).toContain("missing_images")
		expect(weak.blockers).toContain("no_complete_salida")
		expect(weak.blockers.length).toBeGreaterThan(0)

		const strong = scoreTourQuality({
			status: "published",
			imageCount: 5,
			itinerarySteps: 3,
			hasMeetingPoint: true,
			hasDurationMinutes: true,
			hasIncludes: true,
			categoryCount: 1,
			activeTicketCount: 2,
			activeSalidaCount: 2,
			completeSalidaCount: 1,
		})
		expect(strong.score).toBe(100)
		expect(strong.issues).toEqual([])
		expect(strong.blockers).toEqual([])

		const fourPhotos = {
			status: "draft" as const,
			imageCount: 4,
			itinerarySteps: 3,
			hasMeetingPoint: true,
			hasDurationMinutes: true,
			hasIncludes: true,
			categoryCount: 1,
			activeTicketCount: 1,
			activeSalidaCount: 1,
			completeSalidaCount: 1,
		}
		expect(scoreTourQuality(fourPhotos).blockers).toContain("missing_images")
		expect(tourPublicationValidationErrors(fourPhotos).map((e) => e.code)).toEqual([
			"missing_tour_images",
		])
		expect(
			tourPublicationValidationErrors({ ...fourPhotos, imageCount: 5 }).map((e) => e.code)
		).toEqual([])

		const page = read("src/pages/admin/tours/quality.astro")
		expect(page).toContain("loadTourAdminQualityQueue")
		expect(page).toContain("blockers")
		expect(page).toContain("Qué corregir")

		const opsRepo = read(
			"src/modules/booking/infrastructure/repositories/BookingOperationsQueryRepository.ts"
		)
		expect(opsRepo).toContain("BookingLineItem")
		expect(opsRepo).toContain("opsCopy")
		expect(opsRepo).toContain("getVerticalOpsVocabulary")
	})
})
