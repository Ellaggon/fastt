/**
 * Tour marketplace discovery read model.
 * One batched SearchUnitView query → min available price, rating, applicable salida.
 * Avoids N+1 rate-plan lookups on /buscar/tours.
 *
 * Publish gate: Product.publicationState=published, active variant/profile/category.
 * Filters (level/duration) run in SQL before any row cap; price band after
 * per-product min price; card `limit` only after sort.
 */
import {
	normalizeTourDifficulty,
	tourDifficultyLabel,
	tourDifficultyMatchValues,
} from "@/lib/tours/tourDifficulty"
import { durationMinutesMatchesBucket, tourDepartureToStay } from "@/lib/tours/tourSemantics"
import {
	filterTourSearchCardsForCanary,
	recordTourSearch,
	toursPublicSearchEnabled,
} from "@/lib/tours/tourObservability"
import { buildOccupancyKey } from "@/modules/search/public"
import {
	and,
	avg,
	count,
	db,
	eq,
	gt,
	gte,
	Image,
	inArray,
	isNull,
	lt,
	or,
	Product,
	Provider,
	ProductGeoPlace,
	ProductCategory,
	ProductCategoryLink,
	ProductContent,
	ProductReview,
	sql,
	SearchUnitView,
	Tour,
	TourSlotProfile,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { publicCatalogProductEligibility } from "@/lib/marketplace/public-catalog-eligibility"

export type TourSearchCard = {
	productId: string
	providerId: string | null
	name: string
	description: string | null
	imageUrl: string | null
	duration: string | null
	durationMinutes: number | null
	difficultyLevel: string | null
	/** Materialized sellable unit price for the departure day (SUV.pricePerNight). */
	fromPrice: number
	currency: string
	avgRating: number | null
	reviewCount: number
	variantId: string
	ratePlanId: string
	departureTime: string | null
	departureDate: string
	availableSlots: number
}

export type TourSearchAvailability = "ready" | "disabled" | "empty" | "error"

export type TourSearchSurfaceResult = {
	cards: TourSearchCard[]
	meta: {
		source: "SearchUnitView"
		occupancyKey: string
		departureDate: string
		pricingSource: "materialized_search_view"
		/** Distinguishes kill-switch/canary off from commercial zero results. */
		availability: TourSearchAvailability
	}
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function toDateOnly(value: unknown): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	const raw = String(value ?? "").trim()
	return raw.slice(0, 10)
}

function isSellableRow(row: {
	isAvailable: boolean | null
	hasAvailability: boolean | null
	hasPrice: boolean | null
	availableUnits: number | null
	primaryBlocker: string | null
	pricePerNight: string | number | null
}): boolean {
	const price = Number(row.pricePerNight ?? NaN)
	return Boolean(
		row.isAvailable &&
		row.hasAvailability &&
		row.hasPrice &&
		Math.max(0, Number(row.availableUnits ?? 0)) >= 1 &&
		!String(row.primaryBlocker ?? "").trim() &&
		Number.isFinite(price) &&
		price > 0
	)
}

function durationBucketSql(bucket: string | null | undefined) {
	const b = String(bucket ?? "").trim()
	if (!b) return null
	const minutes = Tour.durationMinutes
	if (b === "lt1") return and(sql`${minutes} is not null`, lt(minutes, 24 * 60))
	if (b === "1") return and(gte(minutes, 24 * 60), lt(minutes, 48 * 60))
	if (b === "2-3") return and(gte(minutes, 48 * 60), lt(minutes, 96 * 60))
	if (b === "4-7") return and(gte(minutes, 96 * 60), lt(minutes, 192 * 60))
	if (b === "8+") return gte(minutes, 192 * 60)
	return null
}

/**
 * Discovery occupancy: 1 adult — “precio desde” comparable across products.
 * SUV rows are keyed by occupancy; use buildOccupancyKey(TOUR_DISCOVERY_OCCUPANCY)
 * for the marketplace default tour discovery key.
 */
export const TOUR_DISCOVERY_OCCUPANCY = { adults: 1, children: 0, infants: 0 } as const

export async function getTourSearchSurface(params: {
	startDate: string
	geoPlaceId?: string | null
	categorySlugs?: string[]
	durationBucket?: string | null
	level?: string | null
	priceMin?: number | null
	priceMax?: number | null
	sort?: string
	limit?: number
	/** Stable session/anon id for percentage canary bucketing (not destination). */
	sessionSubjectId?: string | null
	host?: string | null
}): Promise<TourSearchSurfaceResult> {
	const departureDate = String(params.startDate ?? "")
		.trim()
		.slice(0, 10)
	const canarySubject = {
		subjectId: String(params.sessionSubjectId ?? "anonymous").trim() || "anonymous",
		host: params.host ?? null,
	}
	const empty = (outcome: "disabled" | "empty" = "empty"): TourSearchSurfaceResult => {
		recordTourSearch(outcome, { subject: canarySubject })
		return {
			cards: [],
			meta: {
				source: "SearchUnitView",
				occupancyKey: buildOccupancyKey(TOUR_DISCOVERY_OCCUPANCY),
				departureDate,
				pricingSource: "materialized_search_view",
				availability: outcome === "disabled" ? "disabled" : "empty",
			},
		}
	}

	if (!toursPublicSearchEnabled(canarySubject)) {
		return empty("disabled")
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
		return empty("empty")
	}

	try {
		return await loadTourSearchSurfaceCards({
			...params,
			departureDate,
			empty,
			canarySubject,
		})
	} catch {
		recordTourSearch("error", { subject: canarySubject })
		return {
			cards: [],
			meta: {
				source: "SearchUnitView",
				occupancyKey: buildOccupancyKey(TOUR_DISCOVERY_OCCUPANCY),
				departureDate,
				pricingSource: "materialized_search_view",
				availability: "error",
			},
		}
	}
}

async function loadTourSearchSurfaceCards(params: {
	startDate: string
	departureDate: string
	geoPlaceId?: string | null
	categorySlugs?: string[]
	durationBucket?: string | null
	level?: string | null
	priceMin?: number | null
	priceMax?: number | null
	sort?: string
	limit?: number
	canarySubject?: { subjectId?: string | null; host?: string | null }
	empty: (outcome?: "disabled" | "empty") => TourSearchSurfaceResult
}): Promise<TourSearchSurfaceResult> {
	const { departureDate, empty } = params
	const stay = tourDepartureToStay(departureDate)
	const checkIn = stay.checkIn.toISOString().slice(0, 10)
	const checkOut = stay.checkOut.toISOString().slice(0, 10)
	const occupancyKey = buildOccupancyKey(TOUR_DISCOVERY_OCCUPANCY)
	const limit = Math.max(1, Math.min(Number(params.limit ?? 50) || 50, 80))
	const categorySlugs = (params.categorySlugs ?? [])
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
	const levelCanonical = normalizeTourDifficulty(params.level)

	let categoryProductIds: string[] | null = null
	if (categorySlugs.length > 0) {
		const linked = await db
			.select({ productId: ProductCategoryLink.productId })
			.from(ProductCategoryLink)
			.innerJoin(ProductCategory, eq(ProductCategory.id, ProductCategoryLink.categoryId))
			.where(
				and(
					eq(ProductCategory.vertical, "tour"),
					eq(ProductCategory.isActive, true),
					eq(ProductCategory.dataClass, "production"),
					inArray(ProductCategory.slug, categorySlugs)
				)
			)
		categoryProductIds = [...new Set(linked.map((row) => String(row.productId)))]
		if (categoryProductIds.length === 0) {
			return empty("empty")
		}
	}

	const whereParts = [
		sql`lower(${Product.productType}) = 'tour'`,
		publicCatalogProductEligibility(),
		eq(Product.publicationState, "published"),
		eq(Variant.kind, "tour_slot"),
		eq(Variant.salesEnabled, true),
		eq(Variant.lifecycleState, "ready"),
		eq(TourSlotProfile.isActive, true),
		eq(SearchUnitView.occupancyKey, occupancyKey),
		gte(SearchUnitView.date, checkIn),
		lt(SearchUnitView.date, checkOut),
		eq(SearchUnitView.isAvailable, true),
		eq(SearchUnitView.hasPrice, true),
		eq(SearchUnitView.hasAvailability, true),
		gt(SearchUnitView.availableUnits, 0),
		or(isNull(SearchUnitView.primaryBlocker), eq(SearchUnitView.primaryBlocker, "")),
	]

	if (params.geoPlaceId) {
		whereParts.push(eq(ProductGeoPlace.placeId, params.geoPlaceId))
	}

	if (categoryProductIds) {
		whereParts.push(inArray(Product.id, categoryProductIds))
	}

	if (levelCanonical) {
		const matchValues = tourDifficultyMatchValues(levelCanonical)
		whereParts.push(
			sql`lower(${Tour.difficultyLevel}) in (${sql.join(
				matchValues.map((value) => sql`${value}`),
				sql`, `
			)})`
		)
	}

	const durationClause = durationBucketSql(params.durationBucket)
	if (durationClause) {
		whereParts.push(durationClause)
	}

	// No premature row cap: level/duration already in SQL; price/sort/limit apply after
	// per-product aggregation so matching cards are not dropped before filters.
	const rows = await db
		.select({
			productId: SearchUnitView.productId,
			providerId: Product.providerId,
			variantId: SearchUnitView.variantId,
			ratePlanId: SearchUnitView.ratePlanId,
			date: SearchUnitView.date,
			isAvailable: SearchUnitView.isAvailable,
			hasAvailability: SearchUnitView.hasAvailability,
			hasPrice: SearchUnitView.hasPrice,
			availableUnits: SearchUnitView.availableUnits,
			pricePerNight: SearchUnitView.pricePerNight,
			currency: SearchUnitView.currency,
			primaryBlocker: SearchUnitView.primaryBlocker,
			name: Product.name,
			description: ProductContent.description,
			duration: Tour.duration,
			durationMinutes: Tour.durationMinutes,
			difficultyLevel: Tour.difficultyLevel,
			departureTime: TourSlotProfile.departureTime,
			imageUrl: Image.url,
		})
		.from(SearchUnitView)
		.innerJoin(Product, eq(Product.id, SearchUnitView.productId))
		.innerJoin(Provider, eq(Provider.id, Product.providerId))
		.innerJoin(
			ProductGeoPlace,
			and(
				eq(ProductGeoPlace.productId, Product.id),
				eq(ProductGeoPlace.role, "primary_discovery"),
				eq(ProductGeoPlace.isPrimary, true)
			)
		)
		.innerJoin(Variant, eq(Variant.id, SearchUnitView.variantId))
		.innerJoin(
			TourSlotProfile,
			and(eq(TourSlotProfile.variantId, Variant.id), eq(TourSlotProfile.isActive, true))
		)
		.leftJoin(
			ProductContent,
			and(eq(ProductContent.productId, Product.id), eq(ProductContent.dataClass, "production"))
		)
		.leftJoin(Tour, eq(Tour.productId, Product.id))
		.leftJoin(Image, and(eq(Image.entityId, Product.id), eq(Image.isPrimary, true)))
		.where(and(...whereParts))

	type Acc = {
		card: Omit<TourSearchCard, "avgRating" | "reviewCount">
		/** One salida per variant (multiple rate plans do not inflate slot count). */
		variantIds: Set<string>
	}
	const byProduct = new Map<string, Acc>()

	for (const row of rows) {
		if (!isSellableRow(row)) continue
		// Defensive: duration already filtered in SQL when a bucket is set.
		if (!durationMinutesMatchesBucket(row.durationMinutes, params.durationBucket ?? null)) {
			continue
		}

		const productId = String(row.productId)
		const price = roundMoney(Number(row.pricePerNight))
		const currency = String(row.currency ?? "USD").toUpperCase()
		const variantId = String(row.variantId)
		const ratePlanId = String(row.ratePlanId)
		const departureTime =
			row.departureTime == null ? null : String(row.departureTime).trim() || null

		const existing = byProduct.get(productId)
		if (!existing) {
			byProduct.set(productId, {
				variantIds: new Set([variantId]),
				card: {
					productId,
					providerId: row.providerId == null ? null : String(row.providerId),
					name: String(row.name ?? ""),
					description: row.description == null ? null : String(row.description),
					imageUrl: row.imageUrl == null ? null : String(row.imageUrl),
					duration: row.duration == null ? null : String(row.duration),
					durationMinutes: row.durationMinutes == null ? null : Number(row.durationMinutes) || null,
					difficultyLevel:
						row.difficultyLevel == null ? null : tourDifficultyLabel(row.difficultyLevel),
					fromPrice: price,
					currency,
					variantId,
					ratePlanId,
					departureTime,
					departureDate: toDateOnly(row.date) || departureDate,
					availableSlots: 1,
				},
			})
			continue
		}

		existing.variantIds.add(variantId)
		existing.card.availableSlots = existing.variantIds.size
		// Keep the cheapest sellable rate as the “desde” offer + deep-link target.
		if (price < existing.card.fromPrice) {
			existing.card.fromPrice = price
			existing.card.currency = currency
			existing.card.variantId = variantId
			existing.card.ratePlanId = ratePlanId
			existing.card.departureTime = departureTime
		} else if (price === existing.card.fromPrice) {
			// Tie-break: earlier departure time when both priced the same.
			const currentTime = existing.card.departureTime ?? "99:99"
			const nextTime = departureTime ?? "99:99"
			if (nextTime < currentTime) {
				existing.card.variantId = variantId
				existing.card.ratePlanId = ratePlanId
				existing.card.departureTime = departureTime
			}
		}
	}

	let cards = [...byProduct.values()].map((entry) => ({
		...entry.card,
		avgRating: null as number | null,
		reviewCount: 0,
	}))

	// Price band after resolving real available (min) price — never before aggregation.
	const priceMin =
		params.priceMin == null || !Number.isFinite(Number(params.priceMin))
			? null
			: Number(params.priceMin)
	const priceMax =
		params.priceMax == null || !Number.isFinite(Number(params.priceMax))
			? null
			: Number(params.priceMax)
	if (priceMin != null) cards = cards.filter((c) => c.fromPrice >= priceMin)
	if (priceMax != null) cards = cards.filter((c) => c.fromPrice <= priceMax)

	const productIds = cards.map((c) => c.productId)
	const ratingRows =
		productIds.length > 0
			? await db
					.select({
						productId: ProductReview.productId,
						avgRating: avg(ProductReview.rating),
						reviewCount: count(ProductReview.id),
					})
					.from(ProductReview)
					.where(
						and(inArray(ProductReview.productId, productIds), eq(ProductReview.status, "published"))
					)
					.groupBy(ProductReview.productId)
			: []
	const ratingByProduct = new Map(
		ratingRows.map((row) => [
			String(row.productId),
			{
				avg: row.avgRating == null ? null : Number(Number(row.avgRating).toFixed(1)),
				count: Number(row.reviewCount ?? 0),
			},
		])
	)
	for (const card of cards) {
		const rating = ratingByProduct.get(card.productId)
		card.avgRating = rating?.avg ?? null
		card.reviewCount = rating?.count ?? 0
	}

	const sort = String(params.sort ?? "relevance").trim()
	cards.sort((a, b) => {
		if (sort === "price_asc") return a.fromPrice - b.fromPrice
		if (sort === "price_desc") return b.fromPrice - a.fromPrice
		if (sort === "duration_asc") {
			return Number(a.durationMinutes ?? 99999) - Number(b.durationMinutes ?? 99999)
		}
		if (sort === "rating_desc") {
			const ratingDiff = Number(b.avgRating ?? 0) - Number(a.avgRating ?? 0)
			if (ratingDiff !== 0) return ratingDiff
			return b.reviewCount - a.reviewCount
		}
		// relevance: cheapest available first, then rating
		const priceDiff = a.fromPrice - b.fromPrice
		if (priceDiff !== 0) return priceDiff
		return Number(b.avgRating ?? 0) - Number(a.avgRating ?? 0)
	})

	const canaryFiltered = filterTourSearchCardsForCanary(cards, params.canarySubject)
	const sliced = canaryFiltered.slice(0, limit)
	recordTourSearch(sliced.length === 0 ? "empty" : "success", {
		subject: params.canarySubject,
	})
	return {
		cards: sliced,
		meta: {
			source: "SearchUnitView",
			occupancyKey,
			departureDate,
			pricingSource: "materialized_search_view",
			availability: sliced.length === 0 ? "empty" : "ready",
		},
	}
}
