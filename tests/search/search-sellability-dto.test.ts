import { describe, expect, it } from "vitest"

import {
	evaluateStaySellabilityFromView,
	mapPriceToLegacy,
	ReasonCode,
	type SearchUnitViewStayRow,
} from "@/modules/search/public"

function makeRow(overrides: Partial<SearchUnitViewStayRow> = {}): SearchUnitViewStayRow {
	return {
		date: "2026-05-10",
		isSellable: true,
		isAvailable: true,
		hasAvailability: true,
		hasPrice: true,
		stopSell: false,
		availableUnits: 1,
		minStay: null,
		cta: false,
		ctd: false,
		primaryBlocker: null,
		pricePerNight: 13.2,
		...overrides,
	}
}

describe("search sellability DTO", () => {
	it("produces stable DTO snapshot for a sellable stay", () => {
		const stayDates = ["2026-05-10", "2026-05-11", "2026-05-12"]
		const rows = new Map<string, SearchUnitViewStayRow>([
			["2026-05-10", makeRow({ date: "2026-05-10", pricePerNight: 10 })],
			["2026-05-11", makeRow({ date: "2026-05-11", pricePerNight: 11 })],
			["2026-05-12", makeRow({ date: "2026-05-12", pricePerNight: 12 })],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates,
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
		})

		expect(out).toMatchInlineSnapshot(`
			{
			  "availability": {
			    "hasInventory": true,
			    "hasRestrictions": false,
			  },
			  "isSellable": true,
			  "policies": {
			    "isCompliant": true,
			  },
			  "price": {
			    "base": {
			      "amount": 33,
			      "currency": "USD",
			    },
			    "display": {
			      "amount": 33,
			      "currency": "USD",
			    },
			  },
			  "reasonCodes": [],
			}
		`)
	})

	it("sets display currency from context and falls back to base amount (no FX yet)", () => {
		const rows = new Map<string, SearchUnitViewStayRow>([
			["2026-05-10", makeRow({ date: "2026-05-10", pricePerNight: 15 })],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates: ["2026-05-10"],
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
			currency: "BOB",
		})
		expect(out.price.base).toEqual({ amount: 15, currency: "USD" })
		expect(out.price.display).toEqual({ amount: 15, currency: "BOB" })
	})

	it("maps CTA restriction to canonical reason code", () => {
		const rows = new Map<string, SearchUnitViewStayRow>([
			["2026-05-10", makeRow({ date: "2026-05-10", cta: true })],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates: ["2026-05-10"],
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
		})
		expect(out.isSellable).toBe(false)
		expect(out.reasonCodes).toEqual([ReasonCode.CTA_RESTRICTION])
	})

	it("maps min stay to canonical reason code", () => {
		const rows = new Map<string, SearchUnitViewStayRow>([
			["2026-05-10", makeRow({ date: "2026-05-10", minStay: 2 })],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates: ["2026-05-10"],
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
		})
		expect(out.reasonCodes).toEqual([ReasonCode.MIN_STAY_NOT_MET])
	})

	it("maps missing price to canonical reason code", () => {
		const rows = new Map<string, SearchUnitViewStayRow>([
			[
				"2026-05-10",
				makeRow({
					date: "2026-05-10",
					hasPrice: false,
					pricePerNight: null,
					isSellable: false,
					primaryBlocker: "MISSING_PRICE",
				}),
			],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates: ["2026-05-10"],
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
		})
		expect(out.reasonCodes).toEqual([ReasonCode.PRICE_NOT_AVAILABLE])
	})

	it("maps policy blocker to canonical reason code", () => {
		const rows = new Map<string, SearchUnitViewStayRow>([
			[
				"2026-05-10",
				makeRow({
					date: "2026-05-10",
					isSellable: false,
					primaryBlocker: "POLICY_BLOCKED",
				}),
			],
		])
		const out = evaluateStaySellabilityFromView({
			stayDates: ["2026-05-10"],
			checkInDate: "2026-05-10",
			requestedRooms: 1,
			rowsByDate: rows,
		})
		expect(out.isSellable).toBe(false)
		expect(out.reasonCodes).toEqual([ReasonCode.POLICY_BLOCKED])
		expect(out.policies.isCompliant).toBe(false)
	})

	it("maps price contract to legacy shape for backward compatibility", () => {
		expect(
			mapPriceToLegacy({
				base: { amount: 20, currency: "USD" },
				display: { amount: 140, currency: "BOB" },
			})
		).toEqual({
			total: 140,
			currency: "BOB",
		})
		expect(
			mapPriceToLegacy({
				base: { amount: 20, currency: "USD" },
				display: null,
			})
		).toEqual({
			total: 20,
			currency: "USD",
		})
	})
})
