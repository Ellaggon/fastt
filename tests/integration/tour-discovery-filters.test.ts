import "dotenv/config"
import { expect, it } from "vitest"
import { describePostgres as describe } from "../setup/postgres-suite"

import { getTourSearchSurface } from "@/lib/tours/tourSearchSurface"
import { tourDepartureToStay } from "@/lib/tours/tourSemantics"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import {
	db,
	eq,
	GeoPlace,
	Product,
	ProductGeoPlace,
	ProductCategory,
	ProductCategoryLink,
	ProductReview,
	ProductStatus,
	Provider,
	RatePlan,
	SearchUnitView,
	Tour,
	TourSlotProfile,
	Variant,
} from "@/shared/infrastructure/db/compat"

async function seedSellableTour(params: {
	suffix: string
	productId: string
	geoPlaceId: string
	variantId: string
	ratePlanId: string
	departureDate: string
	price: number
	difficultyLevel: string
	durationMinutes: number
	categorySlug?: string
	categoryActive?: boolean
	productStatus?: "draft" | "ready" | "published"
	variantActive?: boolean
	reviewRating?: number
	extraRatePlanId?: string
	extraRatePlanPrice?: number
}) {
	const occupancyKey = buildOccupancyKey({ adults: 1, children: 0, infants: 0 })
	const stay = tourDepartureToStay(params.departureDate)
	const productStatus = params.productStatus ?? "published"
	const variantActive = params.variantActive ?? true

	await db
		.insert(Provider)
		.values({ id: "prov_test", legalName: "Provider prov_test" })
		.onConflictDoNothing()

	await db
		.insert(GeoPlace)
		.values({
			id: params.geoPlaceId,
			canonicalName: "La Paz",
			normalizedName: "la paz",
			slug: `dest-${params.geoPlaceId}`,
			placeType: "city",
			countryCode: "BO",
			status: "active",
			source: "test",
		} as any)
		.onConflictDoNothing()

	await db
		.insert(Product)
		.values({
			id: params.productId,
			name: `Tour ${params.suffix}`,
			productType: "Tour",
			providerId: "prov_test",
		} as any)
		.onConflictDoNothing()

	await db
		.insert(ProductGeoPlace)
		.values({
			id: `pgp_${params.productId}`,
			productId: params.productId,
			placeId: params.geoPlaceId,
			role: "primary_discovery",
			isPrimary: true,
			source: "test",
		})
		.onConflictDoNothing()

	await db
		.insert(ProductStatus)
		.values({
			productId: params.productId,
			state: productStatus,
			validationErrorsJson: null,
		} as any)
		.onConflictDoNothing()

	await db
		.insert(Tour)
		.values({
			productId: params.productId,
			duration: `${Math.round(params.durationMinutes / 60)}h`,
			durationMinutes: params.durationMinutes,
			difficultyLevel: params.difficultyLevel,
			meetingPointJson: { address: "Plaza Murillo" },
			itineraryJson: ["Paso 1", "Paso 2", "Paso 3"],
		} as any)
		.onConflictDoNothing()

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "tour_slot",
		name: "Salida 09:00",
		status: "ready",
		isActive: variantActive,
		createdAt: new Date(),
	} as any)

	await db.insert(TourSlotProfile).values({
		variantId: params.variantId,
		departureTime: "09:00",
		maxPax: 12,
		languageCode: "es",
		bookingMode: "shared",
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)

	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		variantId: params.variantId,
		name: "Standard",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	await db.insert(SearchUnitView).values({
		id: `suv_${params.suffix}`,
		variantId: params.variantId,
		productId: params.productId,
		ratePlanId: params.ratePlanId,
		date: stay.checkIn.toISOString().slice(0, 10),
		occupancyKey,
		totalGuests: 1,
		hasAvailability: true,
		hasPrice: true,
		isAvailable: true,
		availableUnits: 8,
		pricePerNight: params.price,
		currency: "USD",
		primaryBlocker: null,
		minStay: 1,
		maxStay: null,
		minLeadTime: null,
		maxLeadTime: null,
		cta: false,
		ctd: false,
		computedAt: new Date(),
		sourceVersion: "test",
	} as any)

	if (params.extraRatePlanId && params.extraRatePlanPrice != null) {
		await db.insert(RatePlan).values({
			id: params.extraRatePlanId,
			variantId: params.variantId,
			name: "Promo",
			isDefault: false,
			isActive: true,
			createdAt: new Date(),
		} as any)
		await db.insert(SearchUnitView).values({
			id: `suv_${params.suffix}_extra`,
			variantId: params.variantId,
			productId: params.productId,
			ratePlanId: params.extraRatePlanId,
			date: stay.checkIn.toISOString().slice(0, 10),
			occupancyKey,
			totalGuests: 1,
			hasAvailability: true,
			hasPrice: true,
			isAvailable: true,
			availableUnits: 8,
			pricePerNight: params.extraRatePlanPrice,
			currency: "USD",
			primaryBlocker: null,
			minStay: 1,
			maxStay: null,
			minLeadTime: null,
			maxLeadTime: null,
			cta: false,
			ctd: false,
			computedAt: new Date(),
			sourceVersion: "test",
		} as any)
	}

	if (params.categorySlug) {
		const categoryId = `cat_${params.categorySlug}_${params.suffix}`
		await db
			.insert(ProductCategory)
			.values({
				id: categoryId,
				slug: params.categorySlug,
				name: params.categorySlug,
				vertical: "tour",
				sortOrder: 1,
				isActive: params.categoryActive ?? true,
				createdAt: new Date(),
			} as any)
			.onConflictDoNothing()

		await db.insert(ProductCategoryLink).values({
			id: `pcl_${params.suffix}`,
			productId: params.productId,
			categoryId,
			createdAt: new Date(),
		} as any)
	}

	if (params.reviewRating != null) {
		await db.insert(ProductReview).values({
			id: `rev_${params.suffix}`,
			productId: params.productId,
			rating: params.reviewRating,
			status: "published",
			body: "Loved it",
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)
	}
}

describe("integration/tour discovery filters (phase 6 / P1 discovery)", () => {
	it("filters by category/level/price, publishes only, and preserves price matches under limit", async () => {
		process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
		const suffix = crypto.randomUUID().slice(0, 8)
		const departure = "2026-10-20"
		const geoPlaceId = `geo_disc_${suffix}`

		const citySlug = `city-tour-${suffix}`
		const trekSlug = `trekking-${suffix}`
		const inactiveSlug = `inactive-${suffix}`

		await seedSellableTour({
			suffix: `${suffix}_a`,
			productId: `prod_disc_a_${suffix}`,
			geoPlaceId,
			variantId: `var_disc_a_${suffix}`,
			ratePlanId: `rp_disc_a_${suffix}`,
			departureDate: departure,
			price: 40,
			difficultyLevel: "easy",
			durationMinutes: 180,
			categorySlug: citySlug,
			reviewRating: 5,
		})

		await seedSellableTour({
			suffix: `${suffix}_b`,
			productId: `prod_disc_b_${suffix}`,
			geoPlaceId,
			variantId: `var_disc_b_${suffix}`,
			ratePlanId: `rp_disc_b_${suffix}`,
			departureDate: departure,
			price: 120,
			difficultyLevel: "hard",
			durationMinutes: 480,
			categorySlug: trekSlug,
			reviewRating: 3,
		})

		await seedSellableTour({
			suffix: `${suffix}_draft`,
			productId: `prod_disc_draft_${suffix}`,
			geoPlaceId,
			variantId: `var_disc_draft_${suffix}`,
			ratePlanId: `rp_disc_draft_${suffix}`,
			departureDate: departure,
			price: 10,
			difficultyLevel: "easy",
			durationMinutes: 60,
			productStatus: "draft",
		})

		await seedSellableTour({
			suffix: `${suffix}_inactive_cat`,
			productId: `prod_disc_inact_${suffix}`,
			geoPlaceId,
			variantId: `var_disc_inact_${suffix}`,
			ratePlanId: `rp_disc_inact_${suffix}`,
			departureDate: departure,
			price: 55,
			difficultyLevel: "easy",
			durationMinutes: 120,
			categorySlug: inactiveSlug,
			categoryActive: false,
		})

		await seedSellableTour({
			suffix: `${suffix}_dedupe`,
			productId: `prod_disc_dedupe_${suffix}`,
			geoPlaceId,
			variantId: `var_disc_dedupe_${suffix}`,
			ratePlanId: `rp_disc_dedupe_${suffix}`,
			departureDate: departure,
			price: 90,
			difficultyLevel: "easy",
			durationMinutes: 150,
			extraRatePlanId: `rp_disc_dedupe_b_${suffix}`,
			extraRatePlanPrice: 70,
		})

		const byCategory = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			categorySlugs: [citySlug],
			sort: "price_asc",
		})
		expect(byCategory.meta.source).toBe("SearchUnitView")
		expect(byCategory.cards.map((c) => c.productId)).toEqual([`prod_disc_a_${suffix}`])
		expect(byCategory.cards[0]?.fromPrice).toBe(40)

		const inactiveCategory = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			categorySlugs: [inactiveSlug],
		})
		expect(inactiveCategory.cards).toEqual([])

		const byLevel = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			level: "hard",
		})
		expect(byLevel.cards.map((c) => c.productId)).toEqual([`prod_disc_b_${suffix}`])

		const byLevelSpanish = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			level: "Difícil",
		})
		expect(byLevelSpanish.cards.map((c) => c.productId)).toEqual([`prod_disc_b_${suffix}`])
		expect(byLevelSpanish.meta.availability).toBe("ready")

		// Price filter after aggregation + limit only at the end → expensive match survives limit=1.
		const byPrice = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			priceMin: 100,
			limit: 1,
			sort: "price_asc",
		})
		expect(byPrice.cards.map((c) => c.productId)).toEqual([`prod_disc_b_${suffix}`])

		const publishedOnly = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			sort: "price_asc",
		})
		expect(publishedOnly.cards.map((c) => c.productId)).not.toContain(
			`prod_disc_draft_${suffix}`
		)
		expect(publishedOnly.cards.map((c) => c.productId)).toContain(`prod_disc_a_${suffix}`)

		const deduped = publishedOnly.cards.find((c) => c.productId === `prod_disc_dedupe_${suffix}`)
		expect(deduped?.availableSlots).toBe(1)
		expect(deduped?.fromPrice).toBe(70)
		expect(deduped?.ratePlanId).toBe(`rp_disc_dedupe_b_${suffix}`)

		const byRating = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			sort: "rating_desc",
		})
		expect(byRating.cards[0]?.productId).toBe(`prod_disc_a_${suffix}`)
		expect(byRating.cards[0]?.avgRating).toBe(5)
		expect(byRating.cards[0]?.reviewCount).toBeGreaterThanOrEqual(1)

		// Inactive variant must not surface even if ProductStatus is published.
		await db
			.update(Variant)
			.set({ isActive: false } as any)
			.where(eq(Variant.id, `var_disc_a_${suffix}`))
		const afterInactiveVariant = await getTourSearchSurface({
			startDate: departure,
			geoPlaceId,
			categorySlugs: [citySlug],
		})
		expect(afterInactiveVariant.cards).toEqual([])
	}, 60000)
})
