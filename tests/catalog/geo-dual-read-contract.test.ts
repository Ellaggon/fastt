import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("marketplace geography dual-read contract", () => {
	it("keeps the legacy product destination while mirroring resolved writes to GeoPlace", () => {
		const repository = read("src/modules/catalog/infrastructure/repositories/ProductRepository.ts")

		expect(repository).toContain("destinationId: params.destinationId")
		expect(repository).toContain("LegacyDestinationGeoPlaceMap")
		expect(repository).toContain("dual_write_legacy_destination")
		expect(repository).toContain("primary_discovery")
	})

	it("prefers canonical discovery and retains a temporary legacy fallback", () => {
		const destinations = read(
			"src/modules/catalog/infrastructure/repositories/DestinationQueryRepository.ts"
		)
		const hotels = read(
			"src/modules/catalog/infrastructure/repositories/MarketplaceHotelSearchRepository.ts"
		)

		expect(destinations).toContain('source: "geo_place"')
		expect(destinations).toContain("legacyRows")
		expect(hotels).toContain("ProductGeoPlace")
		expect(hotels).toContain("legacyDestinationIds")
	})
})
