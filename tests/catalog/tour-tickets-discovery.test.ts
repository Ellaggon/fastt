import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
	calculateCancellationPenalty,
	tierLeadHours,
} from "@/modules/policies/public"
import { resolveCancelLeadHours } from "@/lib/tours/tourSemantics"

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tour tickets + cancel hours schema contracts (architectural)", () => {
	it("defines TourTicketType, BookingVoucher, hoursBeforeDeparture, checkedInAt", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain('export const TourTicketType = pgTable(\n\t"TourTicketType"')
		expect(tables).toContain('export const BookingVoucher = pgTable(\n\t"BookingVoucher"')
		expect(tables).toContain("hoursBeforeDeparture")
		expect(tables).toContain("checkedInAt")

		const migration = read("db/migrations/2026-08-16_tour_tickets_voucher_discovery.sql")
		expect(migration).toContain("TourTicketType")
		expect(migration).toContain("BookingVoucher")
		expect(migration).toContain("hoursBeforeDeparture")
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

describe("tour discovery schema contracts (architectural)", () => {
	it("defines ProductCategory/Link/Review without hardcoding UI activity lists", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(tables).toContain('export const ProductCategory = pgTable(\n\t"ProductCategory"')
		expect(tables).toContain('export const ProductCategoryLink = pgTable(\n\t"ProductCategoryLink"')
		expect(tables).toContain('export const ProductReview = pgTable(\n\t"ProductReview"')

		const panel = read("src/components/searchPanel/TourSearchPanel.astro")
		expect(panel).toContain("ProductCategory")
		expect(panel).not.toContain("activitiesList = [")

		const backfill = read("db/migrations/2026-08-19_tour_category_link_backfill.sql")
		expect(backfill).toContain("ProductCategoryLink")
		expect(backfill).toContain("TourCategoryBackfillUnmapped")
		// Both INSERTs must share a materialized mapped set (CTE scope is one statement).
		expect(backfill).toContain('CREATE TEMP TABLE "_TourCategoryBackfillMapped"')
		expect(backfill).toContain('FROM "_TourCategoryBackfillMapped" m')
		expect(backfill.match(/FROM "_TourCategoryBackfillMapped" m/g)?.length).toBe(2)
		expect(backfill).toContain('ON CONFLICT ("productId", "categoryId") DO NOTHING')
		expect(backfill).toContain('ON CONFLICT ("id") DO NOTHING')
		// Regression: bare FROM mapped outside its WITH fails at apply time.
		expect(backfill).not.toMatch(/FROM mapped m\s*\nWHERE m\."categoryId" IS NULL/)
	})
})
