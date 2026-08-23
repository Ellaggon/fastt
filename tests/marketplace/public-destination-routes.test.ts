import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	canonicalPublicDepartmentSlug,
	canonicalPublicPlaceSlug,
	publicDestinationHref,
	publicSearchHref,
} from "@/lib/marketplace/publicDestinationRoutes"

describe("public destination routes", () => {
	it("keeps city and department canonical URLs distinct when their names collide", () => {
		expect(canonicalPublicPlaceSlug("La Paz")).toBe("la-paz")
		expect(canonicalPublicDepartmentSlug("La Paz")).toBe("la-paz-department")
		expect(publicDestinationHref("la-paz-department", "alojamientos")).toBe(
			"/destinos/la-paz-department/alojamientos"
		)
	})

	it("normalizes old search parameters into the public search contract", () => {
		const params = new URLSearchParams({
			destinationQuery: "Potosí",
			checkin: "2026-09-01",
			checkout: "2026-09-03",
		})
		expect(publicSearchHref("alojamientos", params)).toBe(
			"/buscar/alojamientos?checkin=2026-09-01&checkout=2026-09-03&destino=potosi"
		)
	})

	it("keeps legacy public URLs as permanent redirects rather than duplicate pages", () => {
		const hotelDepartment = readFileSync("src/pages/hotels/depts/[dept]/index.astro", "utf8")
		const tourDepartment = readFileSync("src/pages/tours/depts/[dept]/index.astro", "utf8")
		const hotelSearch = readFileSync("src/pages/hotels/search.astro", "utf8")
		const tourSearch = readFileSync("src/pages/tours/search.astro", "utf8")

		expect(hotelDepartment).toContain("publicDestinationHref")
		expect(tourDepartment).toContain("publicDestinationHref")
		expect(hotelSearch).toContain('publicSearchHref("alojamientos"')
		expect(tourSearch).toContain('publicSearchHref("tours"')
		for (const page of [hotelDepartment, tourDepartment, hotelSearch, tourSearch]) {
			expect(page).toMatch(/,\s*308\s*\)/)
		}
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
			expect(panel).not.toContain('name="destinationId"')
			expect(panel).not.toContain('name="destinationSlug"')
		}
	})
})
