import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("MarketplaceListingSurface", () => {
	it("provides one shared public structure for hotels and tours", () => {
		const surface = read("src/components/marketplace/MarketplaceListingSurface.astro")
		const hotels = read("src/pages/hotels/index.astro")
		const tours = read("src/pages/tours/index.astro")

		expect(surface).toContain("HotelSearchPanel")
		expect(surface).toContain("TourSearchPanel")
		expect(surface).toContain("Destinos populares")
		expect(surface).toContain("DepartmentCard")
		expect(hotels).toContain('<MarketplaceListingSurface\n\tvertical="hotels"')
		expect(tours).toContain('<MarketplaceListingSurface\n\tvertical="tours"')
	})
})
