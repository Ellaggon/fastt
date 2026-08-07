import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("tour public surfaces (fase 0+1)", () => {
	it("search links to /tours and filters by duration/level copy", () => {
		const source = readFileSync(resolve("src/pages/tours/search.astro"), "utf8")
		expect(source).toContain("href={`/tours/${t.id}`}")
		expect(source).not.toContain("href={`/hotels/${t.id}`}")
		expect(source).toContain("No se encontraron tours para esos filtros.")
		expect(source).not.toContain("No se encontraron hoteles")
		expect(source).toContain("durationMinutesMatchesBucket")
		expect(source).toContain("error querying tours")
	})

	it("tour PDP renders tour fields instead of hotel check-in leftovers", () => {
		const source = readFileSync(resolve("src/pages/tours/[id]/index.astro"), "utf8")
		expect(source).toContain("Itinerario")
		expect(source).toContain("Punto de encuentro")
		expect(source).toContain("includes")
		expect(source).toContain("pickup")
		expect(source).not.toContain("checkInTime")
		expect(source).not.toContain("checkOutTime")
		expect(source).not.toContain("subtype?.stars")
	})

	it("documents semantic mapping for tours", () => {
		const doc = readFileSync(resolve("docs/engineering/tour-vertical-table-taxonomy.md"), "utf8")
		expect(doc).toContain("tour_slot")
		expect(doc).toContain("departureDate")
		expect(doc).toContain("BookingRoomDetail")
		expect(doc).toContain("durationMinutes")
	})
})
