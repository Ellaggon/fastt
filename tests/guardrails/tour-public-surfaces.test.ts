import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("tour public surfaces (fase 0+1)", () => {
	it("search links to /tours and filters by duration/level copy", () => {
		const source = readFileSync(resolve("src/pages/tours/search.astro"), "utf8")
		expect(source).toContain("getTourSearchSurface")
		expect(source).toContain("href={`/tours/${t.productId}")
		expect(source).not.toContain("href={`/hotels/${t.id}`}")
		expect(source).toContain("No hay salidas disponibles")
		expect(source).not.toContain("No se encontraron hoteles")
		expect(source).toContain("error querying tour discovery")
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

	it("exposes provider day-of queue and convergent check-in repair", () => {
		const dayOf = readFileSync(resolve("src/pages/booking/day-of.astro"), "utf8")
		const checkIn = readFileSync(resolve("src/pages/api/booking/check-in.ts"), "utf8")
		const routes = readFileSync(resolve("src/lib/routes.ts"), "utf8")
		expect(routes).toContain("bookingDayOf")
		expect(dayOf).toContain("Cola day-of")
		expect(dayOf).toContain("/api/booking/check-in")
		expect(checkIn).toContain("voucherRepaired")
		expect(checkIn).toContain('String(voucher.status) === "issued"')
		expect(checkIn).toContain("voucher_redeem_repaired")
	})
})
