import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
	calculateCancellationPenalty,
	tierLeadHours,
} from "@/modules/policies/domain/cancellation/cancellationEngine"
import { resolveCancelLeadHours } from "@/lib/tours/tourSemantics"

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tour tickets + voucher + cancel hours (fase 4)", () => {
	it("defines TourTicketType, BookingVoucher, hoursBeforeDeparture, checkedInAt day-of", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain('export const TourTicketType = pgTable(\n\t"TourTicketType"')
		expect(tables).toContain('export const BookingVoucher = pgTable(\n\t"BookingVoucher"')
		expect(tables).toContain("hoursBeforeDeparture")
		expect(tables).toContain("checkedInAt")

		const migration = read("db/migrations/2026-08-16_tour_tickets_voucher_discovery.sql")
		expect(migration).toContain("TourTicketType")
		expect(migration).toContain("BookingVoucher")
		expect(migration).toContain("hoursBeforeDeparture")

		const confirmRepo = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		expect(confirmRepo).toContain("BookingVoucher")
		expect(confirmRepo).toContain('status: "issued"')

		const checkIn = read("src/pages/api/booking/check-in.ts")
		expect(checkIn).toContain("checkedInAt")
		expect(checkIn).toContain("redeemed")
	})

	it("prefers hoursBeforeDeparture over days in cancellation engine", () => {
		expect(tierLeadHours({ daysBeforeArrival: 1, penaltyType: "percentage" })).toBe(24)
		expect(
			tierLeadHours({
				daysBeforeArrival: 2,
				hoursBeforeDeparture: 6,
				penaltyType: "percentage",
			})
		).toBe(6)
		expect(resolveCancelLeadHours({ daysBeforeArrival: 1, hoursBeforeDeparture: 12 })).toBe(12)

		// Cancel 3h before departure: 6h free-cancel tier should not apply; 24h tier with 50% should.
		const penalty = calculateCancellationPenalty(
			[
				{
					daysBeforeArrival: 1,
					hoursBeforeDeparture: 6,
					penaltyType: "percentage",
					penaltyAmount: 0,
				},
				{
					daysBeforeArrival: 0,
					hoursBeforeDeparture: 24,
					penaltyType: "percentage",
					penaltyAmount: 50,
				},
			],
			"2026-09-15T12:00:00.000Z",
			"2026-09-15T09:00:00.000Z",
			100
		)
		expect(penalty).toBe(50)
	})
})

describe("tour discovery categories + reviews (fase 5)", () => {
	it("defines ProductCategory/Link/Review and wires persisted search filters", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain('export const ProductCategory = pgTable(\n\t"ProductCategory"')
		expect(tables).toContain('export const ProductCategoryLink = pgTable(\n\t"ProductCategoryLink"')
		expect(tables).toContain('export const ProductReview = pgTable(\n\t"ProductReview"')

		const panel = read("src/components/searchPanel/TourSearchPanel.astro")
		expect(panel).toContain("ProductCategory")
		expect(panel).toContain('name="category"')
		expect(panel).not.toContain("activitiesList = [")

		const search = read("src/pages/tours/search.astro")
		expect(search).toContain("ProductCategoryLink")
		expect(search).toContain("ProductReview")
		expect(search).toContain("rating_desc")
		expect(search).toContain('params.getAll("category")')
	})
})
