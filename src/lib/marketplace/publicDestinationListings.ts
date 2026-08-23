import {
	and,
	db,
	Destination,
	eq,
	GeoPlace,
	inArray,
	LegacyDestinationGeoPlaceMap,
	Product,
	ProductContent,
	ProductGeoPlace,
	ProductLocation,
	ProductStatus,
	sql,
	Tour,
	Hotel,
} from "@/shared/infrastructure/db/compat"
import { BOLIVIA_MARKETPLACE_GEO_PLACES } from "@/data/geography/bolivia-marketplace-catalog"
import { DEPARTMENTS, getDepartment } from "@/data/departments"
import {
	canonicalPublicPlaceSlug,
	normalizePublicPlace,
	type PublicMarketplaceVertical,
} from "@/lib/marketplace/publicDestinationRoutes"

const RESOLVED_STATUSES = ["auto_matched", "confirmed"] as const

export type PublicDestination = {
	slug: string
	name: string
	placeType: "department" | "city"
	description: string
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

function displayDestination(slug: string): PublicDestination | null {
	const canonicalSlug = canonicalPublicPlaceSlug(slug)
	if (!canonicalSlug) return null
	const place = BOLIVIA_MARKETPLACE_GEO_PLACES.find((candidate) => candidate.slug === canonicalSlug)
	if (!place) {
		const department = getDepartment(canonicalSlug)
		if (!department) return null
		return {
			slug: canonicalSlug,
			name: department.name,
			placeType: "department",
			description: department.description,
		}
	}
	const department =
		place.placeType === "admin_area_1"
			? DEPARTMENTS.find(
					(candidate) =>
						normalizePublicPlace(candidate.name) === normalizePublicPlace(place.canonicalName)
				)
			: null
	return {
		slug: place.slug,
		name: place.canonicalName,
		placeType: place.placeType === "admin_area_1" ? "department" : "city",
		description:
			department?.description ??
			`Encuentra alojamientos y experiencias para conocer ${place.canonicalName}.`,
	}
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
	const destination = displayDestination(params.slug)
	if (!destination) return { destination: null, listings: [] }

	const limit = Math.min(Math.max(1, params.limit ?? 36), 100)
	const productType = productTypeFor(params.vertical)
	const legacyLookupSlug = destination.slug.replace(/-department$/, "")
	let canonicalRows: PublicDestinationListing[] = []
	let legacyDestinationIds: string[] = []

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
						eq(Product.dataClass, "production"),
						eq(ProductStatus.state, "published"),
						eq(ProductGeoPlace.placeId, geoPlace.id),
						eq(ProductGeoPlace.role, "primary_discovery"),
						eq(ProductGeoPlace.isPrimary, true)
					)
				)
				.limit(limit)

			legacyDestinationIds = await db
				.select({ id: LegacyDestinationGeoPlaceMap.legacyDestinationId })
				.from(LegacyDestinationGeoPlaceMap)
				.where(
					and(
						eq(LegacyDestinationGeoPlaceMap.placeId, geoPlace.id),
						inArray(LegacyDestinationGeoPlaceMap.resolutionStatus, RESOLVED_STATUSES)
					)
				)
				.then((rows) => rows.map((row) => row.id))
		}
	} catch {
		// The fallback below keeps public routes available until geography migrations are deployed.
	}

	if (legacyDestinationIds.length === 0) {
		const legacyDestinations = await db
			.select({ id: Destination.id })
			.from(Destination)
			.where(
				sql`lower(${Destination.slug}) = ${legacyLookupSlug} OR lower(${Destination.department}) = ${legacyLookupSlug}`
			)
		legacyDestinationIds = legacyDestinations.map((row) => row.id)
	}

	const legacyRows = legacyDestinationIds.length
		? await db
				.select(listingFields)
				.from(Product)
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
						eq(Product.dataClass, "production"),
						eq(ProductStatus.state, "published"),
						inArray(Product.destinationId, legacyDestinationIds)
					)
				)
				.limit(limit)
		: []

	return { destination, listings: uniqueListings([...canonicalRows, ...legacyRows], limit) }
}

export function resolvePublicDestinationFromSearch(
	value: string | null | undefined
): string | null {
	return (canonicalPublicPlaceSlug(value) ?? normalizePublicPlace(value)) || null
}
