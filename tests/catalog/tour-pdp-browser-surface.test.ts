import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
	buildAgeBandPriceBreakdown,
	tourCupoUnits,
	tourTicketsToOccupancyDetail,
	parseTourTicketQuantitiesFromSearchParams,
} from "@/lib/tours/tourTicketOccupancy"

function read(relativePath: string) {
	return readFileSync(resolve(relativePath), "utf8")
}

const tickets = [
	{ code: "adult", label: "Adulto", isActive: true },
	{ code: "child", label: "Niño", minAge: 3, maxAge: 11, isActive: true },
	{ code: "infant", label: "Infante", minAge: 0, maxAge: 2, isActive: true },
	{ code: "custom", label: "Estudiante", minAge: 18, isActive: true },
]

describe("tour PDP browser surface (trust + ticket→price→hold)", () => {
	// Interaction smoke lives in Playwright: pnpm run test:tours:playwright
	it("PDP trust block keeps published reviews above booking and uses tour copy order", () => {
		const pdp = read("src/pages/tours/[id]/index.astro")
		const departure = read("src/components/tours/TourDepartureSection.astro")

		expect(pdp.indexOf("reseñas publicadas")).toBeGreaterThan(-1)
		// Trust signal in hero, then booking rail, then meeting/itinerary copy.
		expect(pdp.indexOf("reseñas publicadas")).toBeLessThan(pdp.indexOf("<TourDepartureSection"))
		expect(pdp.indexOf("<TourDepartureSection")).toBeLessThan(pdp.indexOf("Punto de encuentro"))
		expect(pdp.indexOf("Punto de encuentro")).toBeLessThan(pdp.indexOf("Itinerario"))
		expect(pdp).toContain("avgRating")
		expect(pdp).toContain("reviewCount")
		expect(pdp).not.toContain("checkInTime")
		expect(pdp).not.toContain("checkOutTime")

		expect(departure).toContain("Reserva tu experiencia")
		expect(departure).toContain("Salidas disponibles")
		expect(departure).toContain("Desglose por age band")
		expect(departure).toContain("data-ticket-qty")
		expect(departure).toContain("data-select-rateplan-id")
		expect(departure).toContain("/api/inventory/hold")
		expect(departure).toContain("Reservar cupo")
		expect(departure.indexOf("Actualizar precio")).toBeLessThan(
			departure.indexOf("Reservar cupo")
		)
		expect(departure.indexOf("Reservar cupo")).toBeLessThan(
			departure.indexOf("Confirmar reserva")
		)
	})

	it("ticket selector maps age bands → cupo → priced mix before hold payload shape", () => {
		const quantities = parseTourTicketQuantitiesFromSearchParams(
			new URLSearchParams("adults=2&children=1&infants=0&custom=0")
		)
		expect(quantities).toMatchObject({ adult: 2, child: 1, infant: 0 })

		const occupancyDetail = tourTicketsToOccupancyDetail({ tickets, quantities })
		const cupo = tourCupoUnits({ tickets, quantities })
		expect(occupancyDetail).toEqual({ adults: 2, children: 1, infants: 0 })
		expect(cupo).toBe(3)

		const policy = {
			baseAmount: 100,
			baseAdults: 1,
			baseChildren: 0,
			childMode: "fixed" as const,
			childValue: 40,
		}
		const mix = buildAgeBandPriceBreakdown({ tickets, quantities, policy })
		const adultsOnly = buildAgeBandPriceBreakdown({
			tickets,
			quantities: { adult: 3, child: 0, infant: 0, custom: 0 },
			policy,
		})
		const mixTotal = mix.rows.reduce((sum, row) => sum + Number(row.lineTotal ?? 0), 0)
		const adultsTotal = adultsOnly.rows.reduce((sum, row) => sum + Number(row.lineTotal ?? 0), 0)
		expect(mixTotal).toBe(240)
		expect(adultsTotal).toBe(300)
		expect(mixTotal).not.toBe(adultsTotal)

		const departure = read("src/components/tours/TourDepartureSection.astro")
		expect(departure).toContain("occupancyDetail")
		expect(departure).toContain("rooms")
		expect(departure).toContain("dateRange")
		expect(departure).toMatch(/variantId:\s*selectedVariantId/)
		expect(departure).toMatch(/ratePlanId:\s*selectedRatePlanId/)
		expect(departure).toContain("No hay cupo suficiente")
		expect(departure).toContain("Cupo reservado")
	})

	it("day-of queue surface exposes check-in + voucher repair for today's salidas", () => {
		const dayOf = read("src/pages/booking/day-of.astro")
		expect(dayOf).toContain("data-day-of-queue")
		expect(dayOf).toContain("Cola day-of")
		expect(dayOf).toContain("/api/booking/check-in")
		expect(dayOf).toContain("Reparar voucher")
		expect(dayOf).toContain("provider-bookings-summary")
		expect(dayOf).toContain('vertical || "").toLowerCase() === "tour"')
		expect(dayOf).toContain("departureTime")
	})
})
