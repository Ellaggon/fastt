import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
	TOUR_SEMANTICS,
	bookingDatesToTourDeparture,
	daysBeforeArrivalAsDaysBeforeDeparture,
	durationMinutesMatchesBucket,
	isTourSlotKind,
	parseDurationMinutes,
	pricePerNightAsUnitPrice,
	tourDepartureToStay,
} from "@/lib/tours/tourSemantics"

describe("tour semantics mapping contract", () => {
	it("maps tour_slot and lodging column aliases", () => {
		expect(TOUR_SEMANTICS.variantKind).toBe("tour_slot")
		expect(TOUR_SEMANTICS.bookingLineItemTable).toBe("BookingLineItem")
		expect(TOUR_SEMANTICS.pricePerUnitColumn).toBe("pricePerNight")
		expect(TOUR_SEMANTICS.departureDateColumn).toBe("checkInDate")
		expect(isTourSlotKind("tour_slot")).toBe(true)
		expect(isTourSlotKind("hotel_room")).toBe(false)
	})

	it("maps departure date to a one-night stay grid", () => {
		const stay = tourDepartureToStay("2026-08-01")
		expect(stay.nights).toBe(1)
		expect(stay.checkIn.toISOString().slice(0, 10)).toBe("2026-08-01")
		expect(stay.checkOut.toISOString().slice(0, 10)).toBe("2026-08-02")
	})

	it("maps booking check-in/out back to tour departure window", () => {
		expect(
			bookingDatesToTourDeparture({
				checkInDate: "2026-08-01",
				checkOutDate: "2026-08-02",
			})
		).toEqual({ departureDate: "2026-08-01", endDate: "2026-08-02" })
	})

	it("aliases pricePerNight and cancellation days", () => {
		expect(pricePerNightAsUnitPrice(120)).toBe(120)
		expect(pricePerNightAsUnitPrice(null)).toBeNull()
		expect(daysBeforeArrivalAsDaysBeforeDeparture(2)).toBe(2)
	})

	it("parses free-text duration into minutes", () => {
		expect(parseDurationMinutes("4 Horas")).toBe(240)
		expect(parseDurationMinutes("3 Días")).toBe(4320)
		expect(parseDurationMinutes("90 minutos")).toBe(90)
		expect(parseDurationMinutes("")).toBeNull()
	})

	it("matches duration filter buckets", () => {
		expect(durationMinutesMatchesBucket(180, "lt1")).toBe(true)
		expect(durationMinutesMatchesBucket(24 * 60, "1")).toBe(true)
		expect(durationMinutesMatchesBucket(3 * 24 * 60, "2-3")).toBe(true)
		expect(durationMinutesMatchesBucket(null, "lt1")).toBe(false)
		expect(durationMinutesMatchesBucket(180, "")).toBe(true)
	})
})

describe("tour JSON shapes contract (fase 0 inventory)", () => {
	const read = (rel: string) =>
		readFileSync(resolve(process.cwd(), rel), "utf8")

	it("keeps create and update paths building identical Tour.*Json shapes", () => {
		for (const rel of [
			"src/modules/catalog/application/use-cases/create-product-subtype.ts",
			"src/pages/api/product/subtype.ts",
		]) {
			const source = read(rel)
			// meetingPointJson: { address, instructions }
			expect(source).toContain('address: form.get("meetingPointAddress")')
			expect(source).toContain('instructions: form.get("meetingPointInstructions")')
			// itineraryJson: [{ step: 1-based, description }]
			expect(source).toContain('listFromForm(form.get("tourItinerary")).map((description, index) => ({')
			expect(source).toContain("step: index + 1")
			// guideJson.languages is a comma-joined string (not an array)
			expect(source).toContain('listFromForm(form.get("guideLanguages")).join(", ")')
			// includes/excludes: string[]; categories are deliberately absent from subtype persistence.
			expect(source).toContain('includesJson: listFromForm(form.get("tourIncludes"))')
			expect(source).toContain('excludesJson: listFromForm(form.get("tourExcludes"))')
			expect(source).not.toContain('categoriesJson: listFromForm(form.get("tourCategories"))')
			expect(source).not.toContain("categoriesJson")
			// pickupJson: { defaultArea, instructions }
			expect(source).toContain('defaultArea: form.get("pickupDefaultArea")')
		}
	})

	it("documents the shapes inventory in the taxonomy doc", () => {
		const doc = read("docs/engineering/tour-vertical-table-taxonomy.md")
		expect(doc).toContain("Tour JSON shapes inventory (Fase 0 contract)")
		expect(doc).toContain("`Array<{ step: number (1-based), description: string }>`")
		expect(doc).toContain("comma-joined")
	})
})

describe("tour content backfill contract (fase 1)", () => {
	const read = (rel: string) =>
		readFileSync(resolve(process.cwd(), rel), "utf8")

	it("normalize migration adds queryable columns and indexes", () => {
		const migration = read("db/migrations/2026-08-14_tour_content_normalize.sql")
		expect(migration).toContain('ADD COLUMN IF NOT EXISTS "durationMinutes" integer')
		expect(migration).toContain('"includesJson" jsonb')
		expect(migration).toContain('"excludesJson" jsonb')
		expect(migration).toContain('"categoriesJson" jsonb')
		expect(migration).toContain('"pickupJson" jsonb')
		expect(migration).toContain('"Tour_durationMinutes_idx"')
		expect(migration).toContain('"Tour_difficultyLevel_idx"')
	})

	it("retires legacy Tour.categoriesJson only after canonical category links are materialized", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const baseline = read("db/postgres/0001_initial_schema.sql")
		const retirement = read("db/migrations/2026-09-28_retire_tour_categories_json.sql")
		const backfillValidator = read("scripts/db/validate-tour-category-backfill-idempotent.ts")

		expect(schema).not.toContain('categoriesJson: jsonb("categoriesJson")')
		expect(baseline).not.toContain('"categoriesJson" jsonb')
		expect(retirement).toContain('TOUR_CATEGORIES_JSON_INVALID_SHAPE')
		expect(retirement).toContain('INSERT INTO "ProductCategoryLink"')
		expect(retirement).toContain('TOUR_CATEGORY_BACKFILL_INCOMPLETE')
		expect(retirement).toContain('ALTER TABLE "Tour" DROP COLUMN "categoriesJson"')
		expect(backfillValidator).toContain("skipped_categories_json_retired")
		expect(backfillValidator).toContain("information_schema.columns")
		expect(backfillValidator).toContain("categoriesJson")
	})

	it("backfill migration derives durationMinutes and includes from legacy data", () => {
		const migration = read("db/migrations/2026-08-17_tour_content_backfill.sql")
		// duration text -> minutes heuristic (hours, days, minutes; idempotent)
		expect(migration).toContain("h|hr|hrs|hora|horas")
		expect(migration).toContain("d|día|dias|días|day|days")
		expect(migration).toContain("m|min|mins|minuto|minutos")
		expect(migration).toContain('WHERE "durationMinutes" IS NULL')
		// includes seeded from itinerary, supporting both legacy shapes
		expect(migration).toContain("jsonb_typeof(elem) = 'object'")
		expect(migration).toContain("jsonb_typeof(elem) = 'string'")
		expect(migration).toContain('t."includesJson" IS NULL')
	})

	it("documents the legacy string[] itinerary shape for readers", () => {
		const doc = read("docs/engineering/tour-vertical-table-taxonomy.md")
		expect(doc).toContain("Legacy `itineraryJson`")
		expect(doc).toContain("2026-08-17_tour_content_backfill.sql")
	})
})
