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
	Provider,
	sql,
	Tour,
	Hotel,
} from "@/shared/infrastructure/db/compat"
import { incrementCounter } from "@/lib/observability/metrics"
import { type PublicMarketplaceVertical } from "@/lib/marketplace/publicDestinationRoutes"
import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"

export type PublicDestination = {
	slug: string
	canonicalPath: string
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

function parseSeoContent(value: unknown): { title: string | null; description: string | null } {
	const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
	const title = String(source.metaTitle ?? "").trim() || null
	const description = String(source.metaDescription ?? "").trim() || null
	return { title, description }
}

async function displayDestination(value: string): Promise<PublicDestination | null> {
	const rawValue = String(value).trim()
	const normalizedPath = rawValue.replace(/^\/+|\/+$/g, "").toLowerCase()

	try {
		const row = await db
			.select({
				slug: GeoPlace.slug,
				canonicalPath: GeoPlace.canonicalPath,
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
			.where(eq(GeoPlace.canonicalPath, normalizedPath))
			.limit(1)
			.then((rows) => rows[0] ?? null)
		if (!row) return null

		const seo = parseSeoContent(row.seoJson)
		return {
			slug: row.slug,
			canonicalPath: row.canonicalPath,
			name: row.canonicalName,
			placeType: row.placeType === "admin_area_1" ? "department" : "city",
			description:
				row.summary?.trim() ||
				`Encuentra alojamientos y experiencias para conocer ${row.canonicalName}.`,
			seoTitle: seo.title,
			seoDescription: seo.description,
		}
	} catch {
		return null
	}
}

/** Resolves only a canonical public path. */
export async function resolvePublicDestination(
	value: string | null | undefined
): Promise<PublicDestination | null> {
	const candidate = String(value ?? "").trim()
	return candidate ? displayDestination(candidate) : null
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
	path: string
	vertical: PublicMarketplaceVertical
	limit?: number
}): Promise<{ destination: PublicDestination | null; listings: PublicDestinationListing[] }> {
	const destination = await resolvePublicDestination(params.path)
	if (!destination) return { destination: null, listings: [] }

	const limit = Math.min(Math.max(1, params.limit ?? 36), 100)
	const productType = productTypeFor(params.vertical)
	let canonicalRows: PublicDestinationListing[] = []

	try {
		const geoPlace = await db
			.select({ id: GeoPlace.id })
			.from(GeoPlace)
			.where(eq(GeoPlace.canonicalPath, destination.canonicalPath))
			.limit(1)
			.then((rows) => rows[0] ?? null)

		if (geoPlace?.id) {
			canonicalRows = await db
				.select(listingFields)
				.from(Product)
				.innerJoin(Provider, eq(Provider.id, Product.providerId))
				.innerJoin(ProductGeoPlace, eq(ProductGeoPlace.productId, Product.id))
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
						eq(Product.publicationState, "published"),
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
