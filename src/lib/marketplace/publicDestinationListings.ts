import {
	and,
	db,
	eq,
	GeoPlace,
	GeoPlaceContent,
	Product,
	ProductContent,
	ProductGeoPlace,
	ProductLocation,
	ProductStatus,
	Provider,
	sql,
	Tour,
	Hotel,
} from "@/shared/infrastructure/db/compat"
import { BOLIVIA_MARKETPLACE_GEO_PLACES } from "@/data/geography/bolivia-marketplace-catalog"
import { incrementCounter } from "@/lib/observability/metrics"
import {
	canonicalPublicPlaceSlug,
	normalizePublicPlace,
	type PublicMarketplaceVertical,
} from "@/lib/marketplace/publicDestinationRoutes"
import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"

export type PublicDestination = {
	slug: string
	name: string
	placeType: "department" | "city"
	description: string
	seoTitle: string | null
	seoDescription: string | null
}

export type PublicDestinationListing = {
	id: string
	name: string
	imageUrl: string | null
	description: string | null
	address: string | null
	stars: number | null
	duration: string | null
	difficultyLevel: string | null
}

function productTypeFor(vertical: PublicMarketplaceVertical) {
	return vertical === "alojamientos" ? "hotel" : "tour"
}

function fallbackDestination(slug: string): PublicDestination | null {
	const canonicalSlug = canonicalPublicPlaceSlug(slug)
	if (!canonicalSlug) return null
	const place = BOLIVIA_MARKETPLACE_GEO_PLACES.find((candidate) => candidate.slug === canonicalSlug)
	if (!place) return null
	return {
		slug: place.slug,
		name: place.canonicalName,
		placeType: place.placeType === "admin_area_1" ? "department" : "city",
		description: `Encuentra alojamientos y experiencias para conocer ${place.canonicalName}.`,
		seoTitle: null,
		seoDescription: null,
	}
}

function parseSeoContent(value: unknown): { title: string | null; description: string | null } {
	const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
	const title = String(source.metaTitle ?? "").trim() || null
	const description = String(source.metaDescription ?? "").trim() || null
	return { title, description }
}

async function displayDestination(slug: string): Promise<PublicDestination | null> {
	const fallback = fallbackDestination(slug)
	if (!fallback) return null

	try {
		const row = await db
			.select({
				slug: GeoPlace.slug,
				canonicalName: GeoPlace.canonicalName,
				placeType: GeoPlace.placeType,
				summary: GeoPlaceContent.summary,
				seoJson: GeoPlaceContent.seoJson,
			})
			.from(GeoPlace)
			.leftJoin(
				GeoPlaceContent,
				and(
					eq(GeoPlaceContent.placeId, GeoPlace.id),
					eq(GeoPlaceContent.locale, "es-BO"),
					eq(GeoPlaceContent.publicationStatus, "published")
				)
			)
			.where(eq(GeoPlace.slug, fallback.slug))
			.limit(1)
			.then((rows) => rows[0] ?? null)
		if (!row) return fallback

		const seo = parseSeoContent(row.seoJson)
		return {
			slug: row.slug,
			name: row.canonicalName,
			placeType: row.placeType === "admin_area_1" ? "department" : "city",
			description: row.summary?.trim() || fallback.description,
			seoTitle: seo.title,
			seoDescription: seo.description,
		}
	} catch {
		// A temporary fallback keeps canonical public routes live during staged rollouts.
		return fallback
	}
}

function recordGeoDiscoveryRead(input: {
	vertical: PublicMarketplaceVertical
	canonicalRows: number
}) {
	incrementCounter("marketplace_geo_discovery_reads_total", {
		vertical: input.vertical,
		strategy: input.canonicalRows > 0 ? "canonical" : "canonical_empty",
	})
	incrementCounter(
		"marketplace_geo_discovery_rows_total",
		{ vertical: input.vertical, source: "canonical" },
		input.canonicalRows
	)
}

const listingFields = {
	id: Product.id,
	name: Product.name,
	imageUrl: sql<string | null>`(
		SELECT url FROM "Image"
		WHERE "entityType" = 'Product' AND "entityId" = ${Product.id}
		ORDER BY "isPrimary" DESC, "order" ASC
		LIMIT 1
	)`.as("imageUrl"),
	description: ProductContent.description,
	address: ProductLocation.address,
	stars: Hotel.stars,
	duration: Tour.duration,
	difficultyLevel: Tour.difficultyLevel,
}

function uniqueListings(rows: PublicDestinationListing[], limit: number) {
	const seen = new Set<string>()
	return rows.reduce<PublicDestinationListing[]>((result, row) => {
		if (result.length >= limit || seen.has(row.id)) return result
		seen.add(row.id)
		result.push(row)
		return result
	}, [])
}

export async function getPublicDestinationListings(params: {
	slug: string
	vertical: PublicMarketplaceVertical
	limit?: number
}): Promise<{ destination: PublicDestination | null; listings: PublicDestinationListing[] }> {
	const destination = await displayDestination(params.slug)
	if (!destination) return { destination: null, listings: [] }

	const limit = Math.min(Math.max(1, params.limit ?? 36), 100)
	const productType = productTypeFor(params.vertical)
	let canonicalRows: PublicDestinationListing[] = []

	try {
		const geoPlace = await db
			.select({ id: GeoPlace.id })
			.from(GeoPlace)
			.where(eq(GeoPlace.slug, destination.slug))
			.limit(1)
			.then((rows) => rows[0] ?? null)

		if (geoPlace?.id) {
			canonicalRows = await db
				.select(listingFields)
				.from(Product)
				.innerJoin(Provider, eq(Provider.id, Product.providerId))
				.innerJoin(ProductGeoPlace, eq(ProductGeoPlace.productId, Product.id))
				.innerJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
				.leftJoin(
					ProductContent,
					and(eq(ProductContent.productId, Product.id), eq(ProductContent.dataClass, "production"))
				)
				.leftJoin(ProductLocation, eq(ProductLocation.productId, Product.id))
				.leftJoin(Hotel, eq(Hotel.productId, Product.id))
				.leftJoin(Tour, eq(Tour.productId, Product.id))
				.where(
					and(
						sql`lower(${Product.productType}) = ${productType}`,
						publicCatalogProductEligibility(),
						eq(ProductStatus.state, "published"),
						eq(ProductGeoPlace.placeId, geoPlace.id),
						eq(ProductGeoPlace.role, "primary_discovery"),
						eq(ProductGeoPlace.isPrimary, true)
					)
				)
				.limit(limit)
		}
	} catch {
		canonicalRows = []
	}

	recordGeoDiscoveryRead({
		vertical: params.vertical,
		canonicalRows: canonicalRows.length,
	})

	return { destination, listings: uniqueListings(canonicalRows, limit) }
}

export function resolvePublicDestinationFromSearch(
	value: string | null | undefined
): string | null {
	return (canonicalPublicPlaceSlug(value) ?? normalizePublicPlace(value)) || null
}
