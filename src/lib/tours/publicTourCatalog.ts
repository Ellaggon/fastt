import {
	and,
	asc,
	db,
	eq,
	Product,
	ProductCategory,
	ProductCategoryLink,
	ProductContent,
	Provider,
	sql,
	Tour,
} from "@/shared/infrastructure/db/compat"

import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"
import { resolvePublicDestination } from "@/lib/marketplace/publicDestinationListings"
import { publicTourCategories } from "@/lib/tours/tourDiscoveryFilters"
import { normalizeTourDifficulty, tourDifficultyLabel } from "@/lib/tours/tourDifficulty"
import { durationMinutesMatchesBucket, parseDurationMinutes } from "@/lib/tours/tourSemantics"

export type PublicTourCatalogCard = {
	productId: string
	name: string
	description: string | null
	imageUrl: string | null
	destinationName: string | null
	duration: string | null
	difficultyLevel: string | null
	avgRating: number | null
	reviewCount: number
}

export type PublicTourCatalogCategory = {
	id: string
	slug: string
	name: string
	productCount: number
}

export type PublicTourCatalogResult = {
	status: "ready" | "empty" | "error"
	cards: PublicTourCatalogCard[]
	categories: PublicTourCatalogCategory[]
}

const cardFields = {
	productId: Product.id,
	name: Product.name,
	description: ProductContent.description,
	imageUrl: sql<string | null>`(
		SELECT image."url" FROM "ProductImage" link
		JOIN "Image" image ON image."id" = link."imageId"
		WHERE link."productId" = ${Product.id}
		ORDER BY link."isPrimary" DESC, link."sortOrder" ASC
		LIMIT 1
	)`.as("imageUrl"),
	destinationName: sql<string | null>`(
		SELECT place."canonicalName" FROM "ProductGeoPlace" relation
		JOIN "GeoPlace" place ON place."id" = relation."placeId"
		WHERE relation."productId" = ${Product.id}
			AND relation."role" = 'primary_discovery'
		ORDER BY relation."isPrimary" DESC
		LIMIT 1
	)`.as("destinationName"),
	duration: Tour.duration,
	difficultyLevel: Tour.difficultyLevel,
	avgRating: sql<number | null>`(
		SELECT ROUND(AVG(review."rating")::numeric, 1)::float
		FROM "ProductReview" review
		WHERE review."productId" = ${Product.id} AND review."status" = 'published'
	)`.as("avgRating"),
	reviewCount: sql<number>`(
		SELECT COUNT(*)::int FROM "ProductReview" review
		WHERE review."productId" = ${Product.id} AND review."status" = 'published'
	)`.as("reviewCount"),
}

/**
 * Date-free public discovery. It deliberately exposes no price or availability:
 * those values belong to the dated SearchUnitView contract.
 */
export async function getPublicTourCatalog(
	params: {
		destinationPath?: string | null
		categorySlugs?: string[]
		durationBucket?: string | null
		level?: string | null
		sort?: string | null
		limit?: number
	} = {}
): Promise<PublicTourCatalogResult> {
	const destinationPath = String(params.destinationPath ?? "").trim()
	const destination = destinationPath ? await resolvePublicDestination(destinationPath) : null
	if (destinationPath && !destination) return { status: "empty", cards: [], categories: [] }

	const categorySlugs = [
		...new Set(
			(params.categorySlugs ?? []).map((slug) => slug.trim().toLowerCase()).filter(Boolean)
		),
	]
	const limit = Math.min(Math.max(1, params.limit ?? 24), 100)
	const level = normalizeTourDifficulty(params.level)

	const destinationPredicate = destination
		? sql`EXISTS (
			SELECT 1 FROM "ProductGeoPlace" relation
			JOIN "GeoPlace" place ON place."id" = relation."placeId"
			WHERE relation."productId" = ${Product.id}
				AND relation."role" = 'primary_discovery'
				AND place."canonicalPath" = ${destination.canonicalPath}
		)`
		: undefined
	const categoryPredicate = categorySlugs.length
		? sql`EXISTS (
			SELECT 1 FROM "ProductCategoryLink" relation
			JOIN "ProductCategory" category ON category."id" = relation."categoryId"
			WHERE relation."productId" = ${Product.id}
				AND category."vertical" = 'tour'
				AND category."isActive" = true
				AND category."dataClass" = 'production'
				AND category."slug" IN (${sql.join(
					categorySlugs.map((slug) => sql`${slug}`),
					sql`, `
				)})
		)`
		: undefined

	try {
		const [rawCards, rawCategories] = await Promise.all([
			db
				.select(cardFields)
				.from(Product)
				.innerJoin(Provider, eq(Provider.id, Product.providerId))
				.leftJoin(
					ProductContent,
					and(eq(ProductContent.productId, Product.id), eq(ProductContent.dataClass, "production"))
				)
				.innerJoin(Tour, eq(Tour.productId, Product.id))
				.where(
					and(
						sql`lower(${Product.productType}) = 'tour'`,
						publicCatalogProductEligibility(),
						eq(Product.publicationState, "published"),
						destinationPredicate,
						categoryPredicate
					)
				)
				.limit(Math.max(limit * 4, 40)),
			db
				.select({
					id: ProductCategory.id,
					slug: ProductCategory.slug,
					name: ProductCategory.name,
					productCount: sql<number>`COUNT(DISTINCT ${Product.id})::int`,
				})
				.from(ProductCategory)
				.innerJoin(ProductCategoryLink, eq(ProductCategoryLink.categoryId, ProductCategory.id))
				.innerJoin(Product, eq(Product.id, ProductCategoryLink.productId))
				.innerJoin(Provider, eq(Provider.id, Product.providerId))
				.where(
					and(
						eq(ProductCategory.vertical, "tour"),
						eq(ProductCategory.isActive, true),
						eq(ProductCategory.dataClass, "production"),
						eq(Product.publicationState, "published"),
						eq(Product.dataClass, "production"),
						publicCatalogProductEligibility()
					)
				)
				.groupBy(
					ProductCategory.id,
					ProductCategory.slug,
					ProductCategory.name,
					ProductCategory.sortOrder
				)
				.orderBy(asc(ProductCategory.sortOrder), asc(ProductCategory.name)),
		])

		const sort = String(params.sort ?? "relevance")
		const cards = rawCards
			.filter((card) =>
				durationMinutesMatchesBucket(parseDurationMinutes(card.duration), params.durationBucket)
			)
			.filter((card) => !level || normalizeTourDifficulty(card.difficultyLevel) === level)
			.sort((a, b) => {
				if (sort === "duration_asc") {
					return (
						Number(parseDurationMinutes(a.duration) ?? 999999) -
						Number(parseDurationMinutes(b.duration) ?? 999999)
					)
				}
				const rating = Number(b.avgRating ?? 0) - Number(a.avgRating ?? 0)
				if (rating) return rating
				const reviews = Number(b.reviewCount ?? 0) - Number(a.reviewCount ?? 0)
				return reviews || a.name.localeCompare(b.name, "es")
			})
			.slice(0, limit)
			.map((card) => ({
				...card,
				avgRating: card.avgRating == null ? null : Number(card.avgRating),
				reviewCount: Number(card.reviewCount ?? 0),
				difficultyLevel: tourDifficultyLabel(card.difficultyLevel) || null,
			}))

		const publicCategories = publicTourCategories(rawCategories)
		const countById = new Map(
			rawCategories.map((category) => [category.id, Number(category.productCount)])
		)
		const categories = publicCategories
			.map((category) => ({ ...category, productCount: countById.get(category.id) ?? 0 }))
			.filter((category) => category.productCount > 0)

		return { status: cards.length ? "ready" : "empty", cards, categories }
	} catch (error) {
		console.error("public tour catalog failed", error)
		return { status: "error", cards: [], categories: [] }
	}
}
