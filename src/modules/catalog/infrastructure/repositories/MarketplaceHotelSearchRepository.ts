import {
	and,
	db,
	Destination,
	eq,
	GeoPlace,
	inArray,
	LegacyDestinationGeoPlaceMap,
	or,
	Product,
	ProductGeoPlace,
	sql,
} from "@/shared/infrastructure/db/compat"
import type {
	MarketplaceHotelCandidate,
	MarketplaceHotelSearchRepositoryPort,
} from "../../application/ports/MarketplaceHotelSearchRepositoryPort"

const RESOLVED_STATUSES = ["auto_matched", "confirmed"] as const

const candidateFields = {
	productId: Product.id,
	name: Product.name,
	destinationId: Product.destinationId,
	heroImageUrl: sql<string>`(
		SELECT url
		FROM "Image"
		WHERE ("entityType" = 'Product' AND "entityId" = ${Product.id})
		   OR (
			  "entityType" = 'Variant'
			  AND "entityId" IN (SELECT id FROM "Variant" WHERE "productId" = ${Product.id})
		   )
		ORDER BY "isPrimary" DESC, "order" ASC
		LIMIT 1
	)`.as("heroImageUrl"),
}

type CandidateRow = {
	productId: string
	name: string
	destinationId: string
	heroImageUrl: string | null
}

function uniqueCandidates(rows: CandidateRow[], limit: number) {
	const ids = new Set<string>()
	return rows.reduce<MarketplaceHotelCandidate[]>((result, row) => {
		const productId = String(row.productId)
		if (result.length >= limit || ids.has(productId)) return result
		ids.add(productId)
		result.push({
			productId,
			name: String(row.name ?? ""),
			destinationId: String(row.destinationId ?? ""),
			heroImageUrl: row.heroImageUrl ? String(row.heroImageUrl) : null,
		})
		return result
	}, [])
}

export class MarketplaceHotelSearchRepository implements MarketplaceHotelSearchRepositoryPort {
	async listHotelsByDestination(params: {
		destinationIdOrSlug: string
		limit: number
	}): Promise<MarketplaceHotelCandidate[]> {
		const lookup = String(params.destinationIdOrSlug ?? "").trim()
		const limit = Math.min(Math.max(1, Number(params.limit ?? 50)), 200)
		if (!lookup) return []

		const [legacyDestination, directGeoPlace] = await Promise.all([
			db
				.select({ id: Destination.id })
				.from(Destination)
				.where(or(eq(Destination.id, lookup), eq(Destination.slug, lookup)))
				.limit(1),
			db
				.select({ id: GeoPlace.id })
				.from(GeoPlace)
				.where(or(eq(GeoPlace.id, lookup), eq(GeoPlace.slug, lookup)))
				.limit(1),
		])

		const mappedGeoPlace = legacyDestination[0]?.id
			? await db
					.select({ placeId: LegacyDestinationGeoPlaceMap.placeId })
					.from(LegacyDestinationGeoPlaceMap)
					.where(
						and(
							eq(LegacyDestinationGeoPlaceMap.legacyDestinationId, legacyDestination[0].id),
							inArray(LegacyDestinationGeoPlaceMap.resolutionStatus, RESOLVED_STATUSES)
						)
					)
					.limit(1)
					.then((rows) => rows[0]?.placeId ?? null)
			: null
		const geoPlaceId = directGeoPlace[0]?.id ?? mappedGeoPlace

		if (!geoPlaceId) {
			if (!legacyDestination[0]?.id) return []
			const legacyRows = await db
				.select(candidateFields)
				.from(Product)
				.where(
					and(
						sql`lower(${Product.productType}) = 'hotel'`,
						eq(Product.destinationId, legacyDestination[0].id)
					)
				)
				.limit(limit)
			return uniqueCandidates(legacyRows, limit)
		}

		const [canonicalRows, mappedDestinationRows] = await Promise.all([
			db
				.select(candidateFields)
				.from(Product)
				.innerJoin(ProductGeoPlace, eq(ProductGeoPlace.productId, Product.id))
				.where(
					and(
						sql`lower(${Product.productType}) = 'hotel'`,
						eq(ProductGeoPlace.placeId, geoPlaceId),
						eq(ProductGeoPlace.role, "primary_discovery"),
						eq(ProductGeoPlace.isPrimary, true)
					)
				)
				.limit(limit),
			db
				.select({ legacyDestinationId: LegacyDestinationGeoPlaceMap.legacyDestinationId })
				.from(LegacyDestinationGeoPlaceMap)
				.where(
					and(
						eq(LegacyDestinationGeoPlaceMap.placeId, geoPlaceId),
						inArray(LegacyDestinationGeoPlaceMap.resolutionStatus, RESOLVED_STATUSES)
					)
				),
		])

		const legacyDestinationIds = mappedDestinationRows.map((row) => row.legacyDestinationId)
		const legacyRows = legacyDestinationIds.length
			? await db
					.select(candidateFields)
					.from(Product)
					.where(
						and(
							sql`lower(${Product.productType}) = 'hotel'`,
							inArray(Product.destinationId, legacyDestinationIds)
						)
					)
					.limit(limit)
			: []

		return uniqueCandidates([...canonicalRows, ...legacyRows], limit)
	}
}
