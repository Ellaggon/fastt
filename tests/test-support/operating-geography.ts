import { db, GeoPlaceExternalId } from "@/shared/infrastructure/db/compat"
import { upsertGeoPlace } from "@/shared/infrastructure/test-support/db-test-data"

export async function ensureOperatingGeographyFixtures() {
	for (const place of [
		{
			id: "geo:bo:la-paz-department",
			canonicalName: "La Paz",
			slug: "la-paz-department",
		},
		{ id: "geo:bo:potosi", canonicalName: "Potosí", slug: "potosi" },
	]) {
		await upsertGeoPlace({ ...place, countryCode: "BO", placeType: "admin_area_1" })
	}
	for (const [code, placeId] of [
		["BO-LP", "geo:bo:la-paz-department"],
		["BO-PT", "geo:bo:potosi"],
	]) {
		await db
			.insert(GeoPlaceExternalId)
			.values({
				id: `qa:legacy-territory:${code}`,
				placeId,
				source: "fastt_legacy_jurisdiction",
				externalId: code,
			})
			.onConflictDoUpdate({
				target: [GeoPlaceExternalId.source, GeoPlaceExternalId.externalId],
				set: { placeId, updatedAt: new Date() },
			})
	}
}
