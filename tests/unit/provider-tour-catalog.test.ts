import { describe, expect, it } from "vitest"
import { tourCatalogFilters, tourCatalogHref } from "@/lib/catalog/providerTourCatalog"

describe("tour catalog URL filters", () => {
	it("normalizes malformed filters and bounds search input", () => {
		expect(tourCatalogFilters(new URLSearchParams("state=ready&page=-2"))).toEqual({
			query: "",
			state: "all",
			page: 1,
		})
		expect(
			tourCatalogFilters(new URLSearchParams({ q: "x".repeat(300), page: "1.5" })).query
		).toHaveLength(120)
	})
	it("preserves search and editorial state through pagination", () => {
		const filters = tourCatalogFilters(new URLSearchParams("q=City+tour&state=published&page=2"))
		expect(tourCatalogHref(filters)).toBe("/catalog/tours?q=City+tour&state=published&page=2")
		expect(tourCatalogHref({ ...filters, state: "all", page: 1 })).toBe(
			"/catalog/tours?q=City+tour"
		)
	})
})
