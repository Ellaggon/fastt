import { describe, expect, it } from "vitest"
import {
	hasInvalidTourPriceRange,
	isValidTourSearchDate,
	parseTourPriceInput,
	publicTourCategories,
} from "@/lib/tours/tourDiscoveryFilters"

describe("tour discovery input rules", () => {
	it("treats an empty price as absent while preserving an explicit zero", () => {
		expect(parseTourPriceInput("")).toEqual({ value: null, invalid: false })
		expect(parseTourPriceInput("0")).toEqual({ value: 0, invalid: false })
		expect(parseTourPriceInput("-1").invalid).toBe(true)
	})

	it("rejects an inverted price range", () => {
		expect(hasInvalidTourPriceRange(parseTourPriceInput("100"), parseTourPriceInput("20"))).toBe(
			true
		)
		expect(hasInvalidTourPriceRange(parseTourPriceInput("0"), parseTourPriceInput("20"))).toBe(
			false
		)
	})

	it("accepts only real ISO departure dates", () => {
		expect(isValidTourSearchDate("2026-10-12")).toBe(true)
		expect(isValidTourSearchDate("2026-02-30")).toBe(false)
		expect(isValidTourSearchDate("12-10-2026")).toBe(false)
	})

	it("does not expose generated or QA taxonomy to travellers", () => {
		expect(
			publicTourCategories([
				{ id: "1", slug: "adventure", name: "adventure" },
				{ id: "2", slug: "city-tour-09aad244", name: "city-tour-09aad244" },
				{ id: "3", slug: "qa-hike", name: "QA hike" },
				{ id: "4", slug: "adventure-duplicate", name: "Aventura" },
				{ id: "5", slug: "trekking-e9a05764", name: "trekking-e9a05764" },
				{ id: "6", slug: "city-tour", name: "City Tour" },
			])
		).toEqual([
			{ id: "1", slug: "adventure", name: "Aventura" },
			{ id: "6", slug: "city-tour", name: "City tour" },
		])
	})
})
