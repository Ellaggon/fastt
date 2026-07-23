import {
	and,
	db,
	eq,
	gte,
	lt,
	Product,
	SearchUnitView,
	sql,
} from "@/shared/infrastructure/db/compat"

import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { buildOccupancyKey } from "@/modules/search/public"

export type PublicSearchResult = {
	productId: string
	name: string
	destinationId: string
	heroImage?: string
	fromPrice: number
	basePrice: number
	totalPrice: number
	currency: string
	available: boolean
	availableVariants: number
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
	destinationId: string
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
			destinationId: Product.destinationId,
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
		.where(
			and(
				eq(Product.destinationId, params.destinationId),
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
		const totalPrice = roundMoney(prices.reduce((sum, price) => sum + price, 0))
		const first = bucket[0]
		const productId = String(first.productId)
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
			destinationId: String(first.destinationId ?? params.destinationId),
			heroImage: first.heroImageUrl ? String(first.heroImageUrl) : undefined,
			fromPrice: totalPrice,
			basePrice: totalPrice,
			totalPrice,
			currency: String(first.currency ?? params.currency).toUpperCase(),
			available: true,
			availableVariants: Math.max(1, existing?.availableVariants ?? 1),
			taxes: { hasIncluded: false, hasExcluded: false },
			freshness: { lastMaterializedAt },
		})
	}

	return {
		results: [...byProduct.values()].sort((a, b) => a.fromPrice - b.fromPrice),
	}
}

export async function getPublicSearchSurface(params: {
	destinationId: string
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
