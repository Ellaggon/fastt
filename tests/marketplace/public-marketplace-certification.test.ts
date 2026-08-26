import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("public marketplace certification", () => {
	it("provides Spanish metadata, canonical URLs and a skip link", () => {
		const layout = read("src/layouts/Layout.astro")
		const uiLayout = read("src/layouts/UILayout.astro")

		expect(layout).toContain('<html lang="es">')
		expect(layout).toContain('name="description"')
		expect(layout).toContain('rel="canonical"')
		expect(layout).toContain('href="#content"')
		expect(uiLayout).toContain("canonicalPath={canonicalPath}")
		expect(read("src/pages/index.astro")).toContain('id="content"')
		expect(read("src/components/marketplace/PublicListingImage.astro")).toContain(
			'aria-label="Imagen no disponible"'
		)
		expect(read("src/components/marketplace/PublicListingImage.astro")).toContain('data-state={src ? "source" : "fallback"}')
	})

	it("keeps public landings semantically navigable and vertically isolated", () => {
		const surface = read("src/components/marketplace/MarketplaceListingSurface.astro")
		const hotels = read("src/pages/hotels/index.astro")
		const tours = read("src/pages/tours/index.astro")

		expect(surface).toContain('id="content"')
		expect(surface).toContain("aria-labelledby")
		expect(surface).toContain("aria-label={`Destinos populares")
		expect(surface).toContain("isHotels ? <HotelSearchPanel /> : <TourSearchPanel />")
		expect(hotels).toContain('vertical="hotels"')
		expect(hotels).toContain('canonicalPath="/hotels"')
		expect(tours).toContain('vertical="tours"')
		expect(tours).toContain('canonicalPath="/tours"')
	})

	it("reads published destination copy and discovery rows from canonical geography", () => {
		const destinationListings = read("src/lib/marketplace/publicDestinationListings.ts")
		const geoSeed = read("src/scripts/seed-bolivia-geo-places.ts")

		expect(destinationListings).toContain("GeoPlaceContent")
		expect(destinationListings).toContain('marketplace_geo_discovery_reads_total')
		expect(destinationListings).toContain('marketplace_geo_discovery_rows_total')
		expect(destinationListings).toContain('strategy: input.canonicalRows > 0 ? "canonical" : "canonical_empty"')
		expect(destinationListings).not.toContain("LegacyDestinationGeoPlaceMap")
		expect(destinationListings).not.toContain('from "@/data/departments"')
		expect(geoSeed).toContain("BOLIVIA_GEO_PLACE_CONTENT")
		expect(geoSeed).toContain('publicationStatus: "published"')
	})

	it("uses the canonical price and availability engines for searches", () => {
		const accommodations = read("src/pages/buscar/alojamientos.astro")
		const tours = read("src/pages/buscar/tours.astro")
		const hotelSurface = read("src/lib/search/publicSearchSurface.ts")

		expect(accommodations).toContain("getPublicSearchSurface")
		expect(accommodations).toContain("result.totalPrice")
		expect(accommodations).toContain("validStay")
		expect(tours).toContain("getTourSearchSurface")
		expect(tours).toContain("availability")
		expect(hotelSurface).toContain("buildPriceQuote")
		expect(hotelSurface).toContain("row.isAvailable")
		expect(hotelSurface).toContain("row.hasPrice")
	})

	it("uses canonical public routes in the performance budget", () => {
		const budget = read("scripts/perf/html-budget.mjs")

		for (const path of [
			'path: "/"',
			'path: "/hotels"',
			'path: "/tours"',
			'path: "/buscar/alojamientos"',
			'path: "/buscar/tours"',
		]) {
			expect(budget).toContain(path)
		}
	})
})
