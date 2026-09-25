import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("MarketplaceListingSurface", () => {
	it("keeps the accommodation shell while tours use a discovery-specific landing", () => {
		const surface = read("src/components/marketplace/MarketplaceListingSurface.astro")
		const hotels = read("src/pages/hotels/index.astro")
		const tours = read("src/pages/tours/index.astro")
		const tourLanding = read("src/components/tours/ToursLandingPage.astro")
		const tourCard = read("src/components/tours/TourDiscoveryCard.astro")

		expect(surface).toContain("HotelSearchPanel")
		expect(surface).toContain("Destinos populares")
		expect(surface).toContain("DepartmentCard")
		expect(hotels).toContain('<MarketplaceListingSurface\n\tvertical="hotels"')
		expect(tours).toContain("ToursLandingPage")
		expect(tours).toContain("getPublicTourCatalog")
		expect(tourLanding).toContain("TourDiscoverySearch")
		expect(tourLanding).toContain("Explora por destino")
		expect(tourCard).toContain("Ver fechas y precios")
	})
})
