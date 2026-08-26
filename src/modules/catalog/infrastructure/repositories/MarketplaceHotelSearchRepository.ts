import {
	and,
	db,
	eq,
	GeoPlace,
	or,
	Product,
	Provider,
	ProductGeoPlace,
	ProductStatus,
	sql,
} from "@/shared/infrastructure/db/compat"
import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"
import type {
	MarketplaceHotelCandidate,
	MarketplaceHotelSearchRepositoryPort,
} from "../../application/ports/MarketplaceHotelSearchRepositoryPort"

const candidateFields = {
	productId: Product.id,
	name: Product.name,
	geoPlaceId: ProductGeoPlace.placeId,
	heroImageUrl: sql<string | null>`(
		SELECT url FROM "Image"
		WHERE ("entityType" = 'Product' AND "entityId" = ${Product.id})
		   OR ("entityType" = 'Variant' AND "entityId" IN (SELECT id FROM "Variant" WHERE "productId" = ${Product.id}))
		ORDER BY "isPrimary" DESC, "order" ASC LIMIT 1
	)`.as("heroImageUrl"),
}

export class MarketplaceHotelSearchRepository implements MarketplaceHotelSearchRepositoryPort {
	async listHotelsByGeoPlace(params: {
		geoPlaceIdOrSlug: string
		limit: number
	}): Promise<MarketplaceHotelCandidate[]> {
		const lookup = String(params.geoPlaceIdOrSlug ?? "").trim()
		if (!lookup) return []
		const place = await db
			.select({ id: GeoPlace.id })
			.from(GeoPlace)
			.where(or(eq(GeoPlace.id, lookup), eq(GeoPlace.canonicalPath, lookup)))
			.limit(1)
			.then((rows) => rows[0] ?? null)
		if (!place) return []

		const rows = await db
			.select(candidateFields)
			.from(Product)
			.innerJoin(Provider, eq(Provider.id, Product.providerId))
			.innerJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.innerJoin(
				ProductGeoPlace,
				and(
					eq(ProductGeoPlace.productId, Product.id),
					eq(ProductGeoPlace.role, "primary_discovery"),
					eq(ProductGeoPlace.isPrimary, true)
				)
			)
			.where(
				and(
					sql`lower(${Product.productType}) = 'hotel'`,
					eq(ProductGeoPlace.placeId, place.id),
					publicCatalogProductEligibility(),
					eq(ProductStatus.state, "published")
				)
			)
			.limit(Math.min(Math.max(1, Number(params.limit ?? 50)), 200))

		return rows.map((row) => ({
			productId: String(row.productId),
			name: String(row.name ?? ""),
			geoPlaceId: String(row.geoPlaceId),
			heroImageUrl: row.heroImageUrl ? String(row.heroImageUrl) : null,
		}))
	}
}
