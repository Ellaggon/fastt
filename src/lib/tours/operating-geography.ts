import {
	and,
	db,
	eq,
	inArray,
	sql,
	GeoPlace,
	GeoPlaceClosure,
	GeoPlaceExternalId,
	GeoPlaceAlias,
} from "@/shared/infrastructure/db/compat"
import type { TerritoryAncestors } from "@/shared/domain/territorial-coverage"

export async function readOperatingPlaces(ids: readonly string[], activeOnly = false) {
	if (!ids.length) return []
	return db
		.select({
			id: GeoPlace.id,
			name: GeoPlace.canonicalName,
			country: GeoPlace.countryCode,
			placeType: GeoPlace.placeType,
			status: GeoPlace.status,
			parentId: GeoPlace.parentId,
		})
		.from(GeoPlace)
		.where(
			and(
				inArray(GeoPlace.id, [...new Set(ids)]),
				activeOnly ? eq(GeoPlace.status, "active") : undefined
			)
		)
}

export async function assertOperatingPlaces(ids: readonly string[], country?: string) {
	const places = await readOperatingPlaces(ids, true)
	if (
		!ids.length ||
		places.length !== new Set(ids).size ||
		places.some((place) => country && place.country !== country)
	)
		throw new Error("invalid_tour_jurisdiction")
	return places
}

export async function readTerritoryAncestors(ids: readonly string[]): Promise<TerritoryAncestors> {
	if (!ids.length) return {}
	const rows = await db
		.select({ descendant: GeoPlaceClosure.descendantId, ancestor: GeoPlaceClosure.ancestorId })
		.from(GeoPlaceClosure)
		.where(inArray(GeoPlaceClosure.descendantId, [...new Set(ids)]))
	const result: Record<string, string[]> = {}
	for (const id of ids) result[id] = [id]
	for (const row of rows) (result[row.descendant] ??= []).push(row.ancestor)
	return result
}

export async function searchOperatingPlaces(q: string, country?: string, offset = 0) {
	const pattern = `%${q
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim()}%`
	return db
		.select({
			id: GeoPlace.id,
			name: GeoPlace.canonicalName,
			country: GeoPlace.countryCode,
			placeType: GeoPlace.placeType,
		})
		.from(GeoPlace)
		.where(
			and(
				eq(GeoPlace.status, "active"),
				country ? eq(GeoPlace.countryCode, country) : undefined,
				inArray(GeoPlace.placeType, [
					"country",
					"admin_area_1",
					"admin_area_2",
					"city",
					"locality",
					"natural_area",
					"poi",
				]),
				sql`(${GeoPlace.normalizedName} LIKE ${pattern} OR EXISTS (SELECT 1 FROM ${GeoPlaceAlias} WHERE ${GeoPlaceAlias.placeId} = ${GeoPlace.id} AND ${GeoPlaceAlias.normalizedAlias} LIKE ${pattern}))`
			)
		)
		.orderBy(GeoPlace.countryCode, GeoPlace.canonicalName, GeoPlace.id)
		.limit(31)
		.offset(offset)
}

/** Immutable signed policy payloads retain their original identifiers. */
export async function readHistoricalTerritoryMap(): Promise<Record<string, string>> {
	const rows = await db
		.select({ code: GeoPlaceExternalId.externalId, id: GeoPlaceExternalId.placeId })
		.from(GeoPlaceExternalId)
		.where(eq(GeoPlaceExternalId.source, "fastt_legacy_jurisdiction"))
	return Object.fromEntries(rows.map((row) => [row.code, row.id]))
}
