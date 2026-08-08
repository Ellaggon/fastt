import { describe, expect, it } from "vitest"
import {
	buildAgeBandPriceBreakdown,
	tourCupoUnits,
	tourTicketsToOccupancyDetail,
	resolveTourTicketPricingBucket,
} from "@/lib/tours/tourTicketOccupancy"

const tickets = [
	{ code: "adult", label: "Adulto", isActive: true },
	{ code: "child", label: "Niño", minAge: 3, maxAge: 11, isActive: true },
	{ code: "infant", label: "Infante", minAge: 0, maxAge: 2, isActive: true },
	{ code: "custom", label: "Estudiante", minAge: 18, isActive: true },
]

describe("tourTicketOccupancy", () => {
	it("maps ticket quantities to occupancyDetail and cupo units", () => {
		const quantities = { adult: 2, child: 1, infant: 0, custom: 0 }
		expect(tourTicketsToOccupancyDetail({ tickets, quantities })).toEqual({
			adults: 2,
			children: 1,
			infants: 0,
		})
		expect(tourCupoUnits({ tickets, quantities })).toBe(3)
	})

	it("prices 2 adults + 1 child differently from 3 adults", () => {
		const policy = {
			baseAmount: 100,
			baseAdults: 1,
			baseChildren: 0,
			childMode: "fixed",
			childValue: 40,
		}
		const mix = buildAgeBandPriceBreakdown({
			tickets,
			quantities: { adult: 2, child: 1 },
			policy,
		})
		const adultsOnly = buildAgeBandPriceBreakdown({
			tickets,
			quantities: { adult: 3, child: 0 },
			policy,
		})
		const mixTotal = mix.rows.reduce((sum, row) => sum + Number(row.lineTotal ?? 0), 0)
		const adultsTotal = adultsOnly.rows.reduce((sum, row) => sum + Number(row.lineTotal ?? 0), 0)
		expect(mixTotal).toBe(240)
		expect(adultsTotal).toBe(300)
		expect(mixTotal).not.toBe(adultsTotal)
	})

	it("documents custom inheriting adult bucket by default / age-based when minAge set", () => {
		expect(resolveTourTicketPricingBucket({ code: "custom" })).toBe("adult")
		expect(resolveTourTicketPricingBucket({ code: "custom", minAge: 18 })).toBe("adult")
		expect(resolveTourTicketPricingBucket({ code: "custom", minAge: 8 })).toBe("child")
		const breakdown = buildAgeBandPriceBreakdown({
			tickets,
			quantities: { adult: 0, custom: 1 },
			policy: {
				baseAmount: 90,
				baseAdults: 1,
				baseChildren: 0,
				childMode: "fixed",
				childValue: 30,
			},
		})
		expect(breakdown.rows[0]?.inheritsAdultPricing).toBe(true)
		expect(breakdown.note).toMatch(/Custom hereda/i)
	})
})
