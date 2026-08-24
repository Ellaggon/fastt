import {
	and,
	db,
	eq,
	gte,
	ProductGeoPlace,
	lt,
	Product,
	SearchUnitView,
	sql,
} from "@/shared/infrastructure/db/compat"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { buildOccupancyKey } from "@/modules/search/public"
import { buildPriceQuote, type PriceQuote } from "@/modules/pricing/public"
import { getProductTaxJurisdictionContext } from "@/lib/taxes-fees/jurisdiction-context"
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"

export type PublicSearchResult = {
	productId: string
	name: string
	geoPlaceId: string
	heroImage?: string
	fromPrice: number
	basePrice: number
	totalPrice: number
	currency: string
	available: boolean
	availableVariants: number
	priceQuote: PriceQuote
	taxes: {
		hasIncluded: boolean
		hasExcluded: boolean
	}
	freshness: {
		lastMaterializedAt: string | null
	}
}

export type PublicSearchSurface = {
	results: PublicSearchResult[]
	meta: {
		source: "SearchUnitView"
		cacheState: "hit" | "miss"
		ranking: "price_asc"
		pricingSource: "materialized_search_view"
		livePricingUsed: false
		lastMaterializedAt: string | null
	}
}

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

function enumerateDates(from: string, toExclusive: string): string[] {
	const out: string[] = []
	let cursor = from
	while (cursor < toExclusive) {
		out.push(cursor)
		cursor = addDays(cursor, 1)
	}
	return out
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeCurrency(value: string | null | undefined): string {
	const currency = String(value ?? "USD")
		.trim()
		.toUpperCase()
	return /^[A-Z]{3}$/.test(currency) ? currency : "USD"
}

async function loadPublicSearchSurface(params: {
	geoPlaceId: string
	checkIn: string
	checkOut: string
	rooms: number
	adults: number
	children: number
	currency: string
}): Promise<Omit<PublicSearchSurface, "meta">> {
	const stayDates = enumerateDates(params.checkIn, params.checkOut)
	if (!stayDates.length) return { results: [] }
	const occupancyKey = buildOccupancyKey({
		adults: Math.max(0, Number(params.adults ?? 0)),
		children: Math.max(0, Number(params.children ?? 0)),
		infants: 0,
	})

	const rows = await db
		.select({
			productId: SearchUnitView.productId,
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
			computedAt: SearchUnitView.computedAt,
			name: Product.name,
			geoPlaceId: ProductGeoPlace.placeId,
			heroImageUrl: sql<string | null>`(
				SELECT url
				FROM "Image"
				WHERE "entityType" = 'Product'
				  AND "entityId" = ${Product.id}
				ORDER BY "isPrimary" DESC, "order" ASC
				LIMIT 1
			)`,
		})
		.from(SearchUnitView)
		.innerJoin(Product, eq(Product.id, SearchUnitView.productId))
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
				eq(ProductGeoPlace.placeId, params.geoPlaceId),
				eq(Product.dataClass, "production"),
				eq(SearchUnitView.occupancyKey, occupancyKey),
				eq(SearchUnitView.currency, params.currency),
				gte(SearchUnitView.date, params.checkIn),
				lt(SearchUnitView.date, params.checkOut)
			)
		)

	const byProductRateVariant = new Map<string, typeof rows>()
	for (const row of rows) {
		const key = `${String(row.productId)}:${String(row.variantId)}:${String(row.ratePlanId)}`
		const bucket = byProductRateVariant.get(key) ?? []
		bucket.push(row)
		byProductRateVariant.set(key, bucket)
	}

	const byProduct = new Map<string, PublicSearchResult>()
	const jurisdictionByProduct = new Map<string, Promise<{ country: string | null }>>()
	for (const bucket of byProductRateVariant.values()) {
		const byDate = new Map(bucket.map((row) => [String(row.date), row]))
		const complete = stayDates.every((date) => byDate.has(date))
		if (!complete) continue
		const sellable = stayDates.every((date) => {
			const row = byDate.get(date)
			return Boolean(
				row &&
				row.isAvailable &&
				row.hasAvailability &&
				row.hasPrice &&
				Math.max(0, Number(row.availableUnits ?? 0)) >= params.rooms &&
				!String(row.primaryBlocker ?? "").trim()
			)
		})
		if (!sellable) continue
		const prices = stayDates.map((date) => Number(byDate.get(date)?.pricePerNight ?? NaN))
		if (prices.some((price) => !Number.isFinite(price) || price <= 0)) continue
		const baseAmount = roundMoney(prices.reduce((sum, price) => sum + price, 0))
		const first = bucket[0]
		const productId = String(first.productId)
		const variantId = String(first.variantId)
		const ratePlanId = String(first.ratePlanId)
		const taxResolved = await resolveEffectiveTaxFeesUseCase({
			productId,
			variantId,
			ratePlanId,
			channel: "web",
		})
		let taxJurisdictionPromise = jurisdictionByProduct.get(productId)
		if (!taxJurisdictionPromise) {
			taxJurisdictionPromise = getProductTaxJurisdictionContext(productId)
			jurisdictionByProduct.set(productId, taxJurisdictionPromise)
		}
		const taxJurisdiction = await taxJurisdictionPromise
		const taxesAndFees = computeTaxBreakdown({
			base: baseAmount,
			definitions: taxResolved.definitions,
			nights: stayDates.length,
			guests: Math.max(1, params.adults + params.children),
			context: {
				...taxJurisdiction,
				checkIn: params.checkIn,
			},
		})
		const priceQuote = buildPriceQuote({
			source: "search",
			context: {
				productId,
				variantId,
				ratePlanId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				rooms: params.rooms,
				occupancy: { adults: params.adults, children: params.children, infants: 0 },
				channel: "web",
			},
			currency: String(first.currency ?? params.currency).toUpperCase(),
			nights: stayDates.length,
			baseAmount,
			taxesAndFees,
			pricing: {
				days: stayDates.map((date, index) => ({ date, price: prices[index] })),
				source: "materialized_search_view",
			},
		})
		const totalPrice = priceQuote.totalAmount
		const existing = byProduct.get(productId)
		const lastMaterializedAt =
			bucket
				.map((row) => new Date(row.computedAt).toISOString())
				.sort()
				.at(-1) ?? null
		if (existing && existing.totalPrice <= totalPrice) {
			existing.availableVariants += 1
			if (
				lastMaterializedAt &&
				(!existing.freshness.lastMaterializedAt ||
					lastMaterializedAt > existing.freshness.lastMaterializedAt)
			) {
				existing.freshness.lastMaterializedAt = lastMaterializedAt
			}
			continue
		}
		byProduct.set(productId, {
			productId,
			name: String(first.name ?? ""),
			geoPlaceId: String(first.geoPlaceId ?? params.geoPlaceId),
			heroImage: first.heroImageUrl ? String(first.heroImageUrl) : undefined,
			fromPrice: totalPrice,
			basePrice: baseAmount,
			totalPrice,
			currency: String(first.currency ?? params.currency).toUpperCase(),
			available: true,
			availableVariants: Math.max(1, existing?.availableVariants ?? 1),
			priceQuote,
			taxes: {
				hasIncluded:
					priceQuote.taxesAndFees.taxes.included.length > 0 ||
					priceQuote.taxesAndFees.fees.included.length > 0,
				hasExcluded:
					priceQuote.taxesAndFees.taxes.excluded.length > 0 ||
					priceQuote.taxesAndFees.fees.excluded.length > 0,
			},
			freshness: { lastMaterializedAt },
		})
	}

	return {
		results: [...byProduct.values()].sort((a, b) => a.fromPrice - b.fromPrice),
	}
}

export async function getPublicSearchSurface(params: {
	geoPlaceId: string
	checkIn: string
	checkOut: string
	rooms: number
	adults: number
	children: number
	currency?: string | null
}): Promise<PublicSearchSurface> {
	const normalized = {
		...params,
		currency: normalizeCurrency(params.currency),
		rooms: Math.max(1, Number(params.rooms ?? 1)),
		adults: Math.max(0, Number(params.adults ?? 0)),
		children: Math.max(0, Number(params.children ?? 0)),
	}
	const key = cacheKeys.publicSearchQuery(normalized)
	const cached = await persistentCache.get(key)
	if (cached && typeof cached === "object") {
		const surface = cached as Omit<PublicSearchSurface, "meta">
		return {
			...surface,
			meta: {
				source: "SearchUnitView",
				cacheState: "hit",
				ranking: "price_asc",
				pricingSource: "materialized_search_view",
				livePricingUsed: false,
				lastMaterializedAt:
					surface.results
						.map((row) => row.freshness.lastMaterializedAt)
						.filter((value): value is string => Boolean(value))
						.sort()
						.at(-1) ?? null,
			},
		}
	}
	const surface = await loadPublicSearchSurface(normalized)
	void persistentCache.set(key, surface, cacheTtls.publicSearchQuery).catch(() => {})
	return {
		...surface,
		meta: {
			source: "SearchUnitView",
			cacheState: "miss",
			ranking: "price_asc",
			pricingSource: "materialized_search_view",
			livePricingUsed: false,
			lastMaterializedAt:
				surface.results
					.map((row) => row.freshness.lastMaterializedAt)
					.filter((value): value is string => Boolean(value))
					.sort()
					.at(-1) ?? null,
		},
	}
}
