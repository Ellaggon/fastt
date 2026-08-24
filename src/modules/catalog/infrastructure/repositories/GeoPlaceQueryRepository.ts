import {
	and,
	db,
	eq,
	GeoPlace,
	GeoPlaceAlias,
	sql,
} from "@/shared/infrastructure/db/compat"
import type {
	GeoPlaceQueryRepositoryPort,
	GeoPlaceRow,
} from "../../application/ports/GeoPlaceQueryRepositoryPort"

function normalizeSearch(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("es-BO")
		.trim()
}

/** Serves canonical GeoPlace IDs while retaining the public destination vocabulary. */
export class GeoPlaceQueryRepository implements GeoPlaceQueryRepositoryPort {
	private async rows(params: { q?: string; limit: number }): Promise<GeoPlaceRow[]> {
		const pattern = params.q ? `%${normalizeSearch(params.q)}%` : null
		const rows = await db
			.select({
				id: GeoPlace.id,
				geoPlaceId: GeoPlace.id,
				name: GeoPlace.canonicalName,
				slug: GeoPlace.slug,
				country: GeoPlace.countryCode,
				department: sql<string | null>`CASE WHEN ${GeoPlace.placeType} = 'admin_area_1' THEN ${GeoPlace.canonicalName} ELSE NULL END`,
				latitude: GeoPlace.centroidLat,
				longitude: GeoPlace.centroidLng,
			})
			.from(GeoPlace)
			.leftJoin(GeoPlaceAlias, eq(GeoPlaceAlias.placeId, GeoPlace.id))
			.where(
				and(
					eq(GeoPlace.status, "active"),
					pattern
						? sql`(${GeoPlace.normalizedName} LIKE ${pattern} OR lower(${GeoPlace.slug}) LIKE ${pattern} OR ${GeoPlaceAlias.normalizedAlias} LIKE ${pattern})`
						: undefined
				)
			)
			.limit(params.limit * 3)

		const seen = new Set<string>()
		return rows.reduce<GeoPlaceRow[]>((result, row) => {
			if (result.length >= params.limit || seen.has(row.geoPlaceId)) return result
			seen.add(row.geoPlaceId)
			result.push({ ...row, source: "geo_place" })
			return result
		}, [])
	}

	list(params: { limit: number }) {
		return this.rows(params)
	}

	search(params: { q: string; limit: number }) {
		return this.rows(params)
	}
}
