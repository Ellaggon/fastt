import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	publicDestinationHref,
	publicGeoPlacePath,
	publicSearchHref,
} from "@/lib/marketplace/publicDestinationRoutes"

describe("public destination routes", () => {
	it("uses only canonical paths for cities and departments with colliding names", () => {
		expect(publicGeoPlacePath("geo:bo:la-paz-city")).toBe(
			"bolivia/la-paz-department/la-paz"
		)
		expect(publicGeoPlacePath("geo:bo:la-paz-department")).toBe("bolivia/la-paz-department")
		expect(() => publicGeoPlacePath("la-paz")).toThrow("Unknown canonical GeoPlace")
		expect(publicDestinationHref("bolivia/la-paz-department", "alojamientos")).toBe(
			"/destinos/bolivia/la-paz-department/alojamientos"
		)
	})

	it("keeps the public search contract on canonical paths", () => {
		const params = new URLSearchParams({
			destino: "bolivia/potosi",
			checkin: "2026-09-01",
			checkout: "2026-09-03",
		})
		expect(publicSearchHref("alojamientos", params)).toBe(
			"/buscar/alojamientos?destino=bolivia%2Fpotosi&checkin=2026-09-01&checkout=2026-09-03"
		)
	})

	it("does not retain legacy destination or search routes", () => {
		for (const path of [
			"src/pages/hotels/depts/[dept]/index.astro",
			"src/pages/tours/depts/[dept]/index.astro",
			"src/pages/hotels/search.astro",
			"src/pages/tours/search.astro",
			"src/pages/hotels/search-v2.astro",
			"src/pages/tours/search-v2.astro",
		]) {
			expect(() => readFileSync(path, "utf8")).toThrow()
		}
		expect(readFileSync("src/pages/destinos/[...route].astro", "utf8")).toContain(
			"destination.canonicalPath"
		)
		expect(() => readFileSync("src/pages/destinos/[slug]/[vertical].astro", "utf8")).toThrow()
	})

	it("keeps the canonical tour search attached to the availability engine", () => {
		const canonicalTourSearch = readFileSync("src/pages/buscar/tours.astro", "utf8")

		expect(canonicalTourSearch).toContain("getTourSearchSurface")
		expect(canonicalTourSearch).toContain("effectiveStartDate")
	})

	it("submits public search forms with the canonical destination parameter", () => {
		const hotelSearchPanel = readFileSync(
			"src/components/searchPanel/HotelSearchPanel.astro",
			"utf8"
		)
		const tourSearchPanel = readFileSync("src/components/searchPanel/TourSearchPanel.astro", "utf8")

		for (const panel of [hotelSearchPanel, tourSearchPanel]) {
			expect(panel).toContain('name="destino"')
			expect(panel).toContain("dataset.canonicalPath")
			expect(panel).not.toContain('name="geoPlaceId"')
			expect(panel).not.toContain("geoPlaceSlug")
			expect(panel).not.toContain("destinationQuery")
		}
	})
})
