import {
	and,
	db,
	Destination,
	eq,
	GeoPlace,
	GeoPlaceAlias,
	inArray,
	LegacyDestinationGeoPlaceMap,
	sql,
} from "@/shared/infrastructure/db/compat"
import type {
	DestinationQueryRepositoryPort,
	DestinationRow,
} from "../../application/ports/DestinationQueryRepositoryPort"

const RESOLVED_STATUSES = ["auto_matched", "confirmed"] as const

function normalizeSearch(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es-BO")
		.trim()
}

type CanonicalRow = {
	id: string
	geoPlaceId: string
	name: string
	slug: string
	country: string
	department: string | null
	latitude: number | null
	longitude: number | null
}

function canonicalDestination(row: CanonicalRow): DestinationRow {
	return {
		id: row.id,
		geoPlaceId: row.geoPlaceId,
		name: row.name,
		slug: row.slug,
		country: row.country,
		department: row.department,
		latitude: row.latitude,
		longitude: row.longitude,
		source: "geo_place",
	}
}

function uniqueCanonical(rows: CanonicalRow[], limit: number): DestinationRow[] {
	const seenPlaces = new Set<string>()
	return rows.reduce<DestinationRow[]>((result, row) => {
		if (result.length >= limit || seenPlaces.has(row.geoPlaceId)) return result
		seenPlaces.add(row.geoPlaceId)
		result.push(canonicalDestination(row))
		return result
	}, [])
}

export class DestinationQueryRepository implements DestinationQueryRepositoryPort {
	private async canonicalRows(params: { q?: string; limit: number }): Promise<DestinationRow[]> {
		const pattern = params.q ? `%${normalizeSearch(params.q)}%` : null
		const rows = await db
			.select({
				id: Destination.id,
				geoPlaceId: GeoPlace.id,
				name: GeoPlace.canonicalName,
				slug: GeoPlace.slug,
				country: GeoPlace.countryCode,
				department: Destination.department,
				latitude: GeoPlace.centroidLat,
				longitude: GeoPlace.centroidLng,
			})
			.from(LegacyDestinationGeoPlaceMap)
			.innerJoin(GeoPlace, eq(GeoPlace.id, LegacyDestinationGeoPlaceMap.placeId))
			.innerJoin(Destination, eq(Destination.id, LegacyDestinationGeoPlaceMap.legacyDestinationId))
			.leftJoin(GeoPlaceAlias, eq(GeoPlaceAlias.placeId, GeoPlace.id))
			.where(
				and(
					inArray(LegacyDestinationGeoPlaceMap.resolutionStatus, RESOLVED_STATUSES),
					pattern
						? sql`(
							${GeoPlace.normalizedName} LIKE ${pattern}
							OR lower(${GeoPlace.slug}) LIKE ${pattern}
							OR lower(${GeoPlaceAlias.normalizedAlias}) LIKE ${pattern}
						)`
						: undefined
				)
			)
			.limit(params.limit * 4)

		return uniqueCanonical(rows, params.limit)
	}

	private async legacyRows(params: { q?: string; limit: number; alreadyIncludedIds: Set<string> }) {
		const pattern = params.q ? `%${params.q.toLowerCase()}%` : null
		const rows = await db
			.select()
			.from(Destination)
			.where(
				pattern
					? sql`(lower(${Destination.name}) LIKE ${pattern} OR lower(${Destination.slug}) LIKE ${pattern} OR lower(${Destination.department}) LIKE ${pattern})`
					: undefined
			)
			.limit(params.limit * 3)

		return rows
			.filter((row) => !params.alreadyIncludedIds.has(row.id))
			.slice(
				0,
				Math.max(0, params.limit - params.alreadyIncludedIds.size)
			) as unknown as DestinationRow[]
	}

	async list(params: { limit: number }): Promise<DestinationRow[]> {
		const canonical = await this.canonicalRows(params)
		const legacy = await this.legacyRows({
			limit: params.limit,
			alreadyIncludedIds: new Set(canonical.map((row) => String(row.id))),
		})
		return [...canonical, ...legacy].slice(0, params.limit)
	}

	async search(params: { q: string; limit: number }): Promise<DestinationRow[]> {
		const canonical = await this.canonicalRows(params)
		const legacy = await this.legacyRows({
			q: params.q,
			limit: params.limit,
			alreadyIncludedIds: new Set(canonical.map((row) => String(row.id))),
		})
		return [...canonical, ...legacy].slice(0, params.limit)
	}
}
