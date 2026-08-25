import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
	GeoPlace,
	GeoPlaceAlias,
	GeoPlaceClosure,
	GeoPlaceContent,
	GeoPlaceExternalId,
	Product,
	ProductGeoPlace,
} from "@/shared/infrastructure/db/schema/tables"

function columnsOf(table: Parameters<typeof getTableColumns>[0]) {
	return Object.keys(getTableColumns(table)).sort()
}

describe("marketplace geography schema", () => {
	it("keeps canonical geography, hierarchy and localized discovery data separate", () => {
		expect(columnsOf(GeoPlace)).toEqual(
			expect.arrayContaining([
				"canonicalName",
				"normalizedName",
				"parentId",
				"mergedIntoId",
				"countryCode",
				"placeType",
				"status",
			])
		)
		expect(columnsOf(GeoPlaceClosure)).toEqual(
			expect.arrayContaining(["ancestorId", "descendantId", "depth"])
		)
		expect(columnsOf(GeoPlaceAlias)).toEqual(
			expect.arrayContaining(["placeId", "locale", "normalizedAlias", "aliasType"])
		)
		expect(columnsOf(GeoPlaceContent)).toEqual(
			expect.arrayContaining(["placeId", "locale", "publicationStatus", "heroImageId"])
		)
		expect(columnsOf(GeoPlaceExternalId)).toEqual(
			expect.arrayContaining(["placeId", "source", "externalId"])
		)
	})

	it("uses ProductGeoPlace as the only product geography relation", () => {
		expect(columnsOf(Product)).not.toContain("destinationId")
		expect(columnsOf(Product)).not.toContain("geoPlaceId")
		expect(columnsOf(ProductGeoPlace)).toEqual(
			expect.arrayContaining(["productId", "placeId", "role", "isPrimary", "source"])
		)
	})
})
