import { describe, it, expect } from "vitest"

import { baseRateRepository, dailyInventoryRepository } from "@/container"
import { GET as searchV2Get } from "@/pages/api/search-v2"
import { db, EffectiveAvailability, EffectiveRestriction } from "@/shared/infrastructure/db/compat"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"

import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

const PUBLIC_TEST_CHECK_IN = "2030-06-10"

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function makeGetRequest(path: string): Request {
	return new Request(`http://localhost:4321${path}`, { method: "GET" })
}

async function seedHotelVariant(params: {
	email: string
	providerId: string
	geoPlaceId: string
	destinationSlug: string
	productId: string
	variantId: string
	baseRate?: number
	date: string
	totalInventory: number
	stopSell?: boolean
	ratePlanTemplateId: string
	ratePlanId: string
}) {
	await upsertGeoPlace({
		id: params.geoPlaceId,
		slug: params.destinationSlug,
		name: "Dest",
		type: "city",
		country: "CL",
	})
	await upsertProvider({
		id: params.providerId,
		displayName: "Prov",
		ownerEmail: params.email,
		accountPurpose: "commercial",
		dataClassification: "production",
	})
	await upsertProduct({
		id: params.productId,
		name: `Hotel ${params.productId}`,
		productType: "Hotel",
		geoPlaceId: params.geoPlaceId,
		providerId: params.providerId,
		dataClass: "production",
		publicationState: "published",
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: `Room ${params.variantId}`,
		currency: "USD",
		isActive: true,
	})

	await dailyInventoryRepository.upsert({
		id: `di_${crypto.randomUUID()}`,
		variantId: params.variantId,
		date: params.date,
		totalInventory: params.totalInventory,
		reservedCount: 0,
		stopSell: params.stopSell ?? false,
	} as any)
	await db
		.insert(EffectiveAvailability)
		.values({
			id: `ea_${params.variantId}_${params.date}`,
			variantId: params.variantId,
			date: params.date,
			totalUnits: params.totalInventory,
			heldUnits: 0,
			bookedUnits: 0,
			availableUnits: params.totalInventory,
			computedAt: new Date(),
		} as any)
		.onConflictDoUpdate({
			target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
			set: {
				totalUnits: params.totalInventory,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: params.totalInventory,
				computedAt: new Date(),
			},
		})

	await upsertRatePlanTemplate({
		id: params.ratePlanTemplateId,
		name: "Default",
		paymentType: "prepay",
		refundable: true,
	})
	await upsertRatePlan({
		id: params.ratePlanId,
		templateId: params.ratePlanTemplateId,
		variantId: params.variantId,
		isActive: true,
		isDefault: true,
		baseAmount: params.baseRate ?? 100,
		baseCurrency: "USD",
	})
	await baseRateRepository.setCanonicalPricingBaselineForRatePlan({
		ratePlanId: params.ratePlanId,
		currency: "USD",
		basePrice: params.baseRate ?? 100,
	})

	const checkOut = addDays(params.date, 1)
	const occupancy = { adults: 2, children: 0, infants: 0 }
	await ensurePricingCoverageForRequestRuntime({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		checkIn: params.date,
		checkOut,
		occupancy,
	})
	await db
		.insert(EffectiveRestriction)
		.values({
			id: `er_${params.variantId}_${params.ratePlanId}_${params.date}`,
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			date: params.date,
			minStay: null,
			maxStay: null,
			minLeadTime: null,
			maxLeadTime: null,
			cta: false,
			ctd: false,
			stopSell: Boolean(params.stopSell),
			priority: params.stopSell ? 100 : 0,
			computedAt: new Date(),
		} as any)
		.onConflictDoUpdate({
			target: [
				EffectiveRestriction.variantId,
				EffectiveRestriction.ratePlanId,
				EffectiveRestriction.date,
			],
			set: {
				stopSell: Boolean(params.stopSell),
				priority: params.stopSell ? 100 : 0,
				computedAt: new Date(),
			},
		})
	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from: params.date,
		to: checkOut,
		occupancies: [occupancy],
		currency: "USD",
	})
}

describe("integration/search-v2 marketplace search", () => {
	it("product with availability appears and fromPrice is the cheapest across variants", async () => {
		const scope = crypto.randomUUID()
		const email = `search-${scope}@example.com`
		const providerId = `prov_search_${scope}`
		const geoPlaceId = `place_search_${scope}`
		const destinationSlug = `search-${scope}`
		const productId = `prod_search_${scope}`
		const date = PUBLIC_TEST_CHECK_IN

		// Product A: two variants, cheapest should win.
		await seedHotelVariant({
			email,
			providerId,
			geoPlaceId,
			destinationSlug,
			productId,
			variantId: `var_a1_${scope}`,
			baseRate: 120,
			date,
			totalInventory: 2,
			ratePlanTemplateId: `rpt_a1_${scope}`,
			ratePlanId: `rp_a1_${scope}`,
		})
		await seedHotelVariant({
			email,
			providerId,
			geoPlaceId,
			destinationSlug,
			productId,
			variantId: `var_a2_${scope}`,
			baseRate: 80,
			date,
			totalInventory: 2,
			ratePlanTemplateId: `rpt_a2_${scope}`,
			ratePlanId: `rp_a2_${scope}`,
		})

		// Product B: canonical restriction stop_sell => excluded.
		await seedHotelVariant({
			email,
			providerId,
			geoPlaceId,
			destinationSlug,
			productId: `prod_blocked_${scope}`,
			variantId: `var_blocked_${scope}`,
			baseRate: 50,
			date,
			totalInventory: 2,
			stopSell: true,
			ratePlanTemplateId: `rpt_blocked_${scope}`,
			ratePlanId: `rp_blocked_${scope}`,
		})

		const req = makeGetRequest(
			`/api/search-v2?geoPlaceId=${encodeURIComponent(geoPlaceId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent(addDays(date, 1))}&rooms=1&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)

		const json = await res.json()
		expect(Array.isArray(json.results)).toBe(true)

		// Only Product A should appear.
		expect(json.results.length).toBe(1)
		expect(json.results[0].productId).toBe(productId)
		expect(json.results[0].fromPrice).toBe(80)
		expect(json.results[0].availableVariants).toBe(2)
	})

	it("rooms > availability excludes product", async () => {
		const scope = crypto.randomUUID()
		const email = `search-quantity-${scope}@example.com`
		const providerId = `prov_search_quantity_${scope}`
		const geoPlaceId = `place_search_quantity_${scope}`
		const destinationSlug = `search-quantity-${scope}`
		const date = PUBLIC_TEST_CHECK_IN

		await seedHotelVariant({
			email,
			providerId,
			geoPlaceId,
			destinationSlug,
			productId: `prod_quantity_${scope}`,
			variantId: `var_quantity_${scope}`,
			baseRate: 100,
			date,
			totalInventory: 2,
			ratePlanTemplateId: `rpt_quantity_${scope}`,
			ratePlanId: `rp_quantity_${scope}`,
		})

		const req = makeGetRequest(
			`/api/search-v2?geoPlaceId=${encodeURIComponent(geoPlaceId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent(addDays(date, 1))}&rooms=3&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)
		const json = await res.json()
		expect(json.results).toEqual([])
	})

	it("without legacy base-rate write, product remains sellable when policy base exists", async () => {
		const scope = crypto.randomUUID()
		const email = `search-policy-${scope}@example.com`
		const providerId = `prov_search_policy_${scope}`
		const geoPlaceId = `place_search_policy_${scope}`
		const destinationSlug = `search-policy-${scope}`
		const productId = `prod_policy_${scope}`
		const date = PUBLIC_TEST_CHECK_IN

		// The rate plan policy, not a legacy variant field, establishes the base price.
		await seedHotelVariant({
			email,
			providerId,
			geoPlaceId,
			destinationSlug,
			productId,
			variantId: `var_policy_${scope}`,
			baseRate: undefined,
			date,
			totalInventory: 2,
			ratePlanTemplateId: `rpt_policy_${scope}`,
			ratePlanId: `rp_policy_${scope}`,
		})

		const req = makeGetRequest(
			`/api/search-v2?geoPlaceId=${encodeURIComponent(geoPlaceId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent(addDays(date, 1))}&rooms=1&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)
		const json = await res.json()

		expect(Array.isArray(json.results)).toBe(true)
		expect(json.results.length).toBe(1)
		expect(json.results[0].productId).toBe(productId)
		expect(json.results[0].fromPrice).toBe(100)
	})
})
