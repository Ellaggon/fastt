import { readFileSync } from "node:fs"

import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
	GeoPlace,
	GeoPlaceAlias,
	GeoPlaceClosure,
	GeoPlaceContent,
	GeoPlaceExternalId,
	LegacyDestinationGeoPlaceMap,
	Product,
	ProductGeoPlace,
	ProductGeoPlaceBackfill,
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
		expect(columnsOf(LegacyDestinationGeoPlaceMap)).toEqual(
			expect.arrayContaining([
				"legacyDestinationId",
				"placeId",
				"resolutionStatus",
				"matchMethod",
				"confidence",
				"evidenceJson",
			])
		)
		expect(columnsOf(ProductGeoPlaceBackfill)).toEqual(
			expect.arrayContaining([
				"productId",
				"placeId",
				"legacyDestinationMapId",
				"resolutionStatus",
				"appliedProductGeoPlaceId",
			])
		)
	})

	it("adds product geography without replacing the legacy destination relation", () => {
		expect(columnsOf(Product)).toContain("destinationId")
		expect(columnsOf(ProductGeoPlace)).toEqual(
			expect.arrayContaining(["productId", "placeId", "role", "isPrimary", "source"])
		)

		const migration = readFileSync("db/migrations/2026-08-24_marketplace_geo_places.sql", "utf8")
		expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ProductGeoPlace"')
		expect(migration).not.toContain('DROP TABLE "Destination"')
		expect(migration).not.toContain('DROP COLUMN "destinationId"')

		const backfillMigration = readFileSync(
			"db/migrations/2026-08-25_marketplace_geo_backfill_audit.sql",
			"utf8"
		)
		expect(backfillMigration).toContain('CREATE TABLE IF NOT EXISTS "LegacyDestinationGeoPlaceMap"')
		expect(backfillMigration).toContain('CREATE TABLE IF NOT EXISTS "ProductGeoPlaceBackfill"')
		expect(backfillMigration).not.toContain('DROP TABLE "Destination"')
		expect(backfillMigration).not.toContain('DROP COLUMN "destinationId"')
	})
})
