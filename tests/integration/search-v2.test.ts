import { describe, it, expect } from "vitest"

import { baseRateRepository, dailyInventoryRepository } from "@/container"
import { GET as searchV2Get } from "@/pages/api/search-v2"
import { db, EffectiveAvailability, EffectivePricing } from "astro:db"
import { materializeSearchUnitRange } from "@/modules/search/public"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

function makeGetRequest(path: string): Request {
	return new Request(`http://localhost:4321${path}`, { method: "GET" })
}

async function seedHotelVariant(params: {
	email: string
	providerId: string
	destinationId: string
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
	await upsertDestination({
		id: params.destinationId,
		slug: params.destinationSlug,
		name: "Dest",
		type: "city",
		country: "CL",
	})
	await upsertProvider({ id: params.providerId, displayName: "Prov", ownerEmail: params.email })
	await upsertProduct({
		id: params.productId,
		name: `Hotel ${params.productId}`,
		productType: "Hotel",
		destinationId: params.destinationId,
		providerId: params.providerId,
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: `Room ${params.variantId}`,
		currency: "USD",
		basePrice: params.baseRate ?? null, // legacy field, not used by search-v2 filtering (we use baseRateRepository below)
		isActive: true,
	})

	if (params.baseRate !== undefined) {
		await baseRateRepository.upsert({
			variantId: params.variantId,
			currency: "USD",
			basePrice: params.baseRate,
		})
	}

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
			availableUnits: params.stopSell ? 0 : params.totalInventory,
			stopSell: params.stopSell ?? false,
			isSellable: !Boolean(params.stopSell ?? false) && params.totalInventory > 0,
			computedAt: new Date(),
		} as any)
		.onConflictDoUpdate({
			target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
			set: {
				totalUnits: params.totalInventory,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: params.stopSell ? 0 : params.totalInventory,
				stopSell: params.stopSell ?? false,
				isSellable: !Boolean(params.stopSell ?? false) && params.totalInventory > 0,
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
	})

	if (params.baseRate !== undefined) {
		await db
			.insert(EffectivePricing)
			.values({
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				date: params.date,
				basePrice: params.baseRate,
				finalBasePrice: params.baseRate,
				yieldMultiplier: 1,
				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [EffectivePricing.variantId, EffectivePricing.ratePlanId, EffectivePricing.date],
				set: {
					basePrice: params.baseRate,
					finalBasePrice: params.baseRate,
					computedAt: new Date(),
				},
			})
	}

	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from: params.date,
		to: new Date(new Date(`${params.date}T00:00:00.000Z`).getTime() + 86400000 * 2)
			.toISOString()
			.slice(0, 10),
		currency: "USD",
	})
}

describe("integration/search-v2 marketplace search", () => {
	it("product with availability appears and fromPrice is the cheapest across variants", async () => {
		const email = "user@example.com"
		const providerId = "prov_search_v2"
		const destinationId = "la-paz"
		const destinationSlug = "la-paz"
		const date = "2026-03-10"

		// Product A: two variants, cheapest should win.
		await seedHotelVariant({
			email,
			providerId,
			destinationId,
			destinationSlug,
			productId: "prod_a",
			variantId: "var_a1",
			baseRate: 120,
			date,
			totalInventory: 2,
			ratePlanTemplateId: "rpt_a1",
			ratePlanId: "rp_a1",
		})
		await seedHotelVariant({
			email,
			providerId,
			destinationId,
			destinationSlug,
			productId: "prod_a",
			variantId: "var_a2",
			baseRate: 80,
			date,
			totalInventory: 2,
			ratePlanTemplateId: "rpt_a2",
			ratePlanId: "rp_a2",
		})

		// Product B: stopSell => excluded.
		await seedHotelVariant({
			email,
			providerId,
			destinationId,
			destinationSlug,
			productId: "prod_b",
			variantId: "var_b1",
			baseRate: 50,
			date,
			totalInventory: 2,
			stopSell: true,
			ratePlanTemplateId: "rpt_b1",
			ratePlanId: "rp_b1",
		})

		const req = makeGetRequest(
			`/api/search-v2?destinationId=${encodeURIComponent(destinationId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent("2026-03-11")}&rooms=1&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)

		const json = await res.json()
		expect(Array.isArray(json.results)).toBe(true)

		// Only Product A should appear.
		expect(json.results.length).toBe(1)
		expect(json.results[0].productId).toBe("prod_a")
		expect(json.results[0].fromPrice).toBe(80)
		expect(json.results[0].availableVariants).toBe(2)
	})

	it("rooms > availability excludes product", async () => {
		const email = "user@example.com"
		const providerId = "prov_search_v2_qty"
		const destinationId = "dest_qty"
		const destinationSlug = "dest-qty"
		const date = "2026-03-10"

		await seedHotelVariant({
			email,
			providerId,
			destinationId,
			destinationSlug,
			productId: "prod_qty",
			variantId: "var_qty_1",
			baseRate: 100,
			date,
			totalInventory: 2,
			ratePlanTemplateId: "rpt_qty_1",
			ratePlanId: "rp_qty_1",
		})

		const req = makeGetRequest(
			`/api/search-v2?destinationId=${encodeURIComponent(destinationId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent("2026-03-11")}&rooms=3&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)
		const json = await res.json()
		expect(json.results).toEqual([])
	})

	it("missing base rate excludes variant/product (no free pricing)", async () => {
		const email = "user@example.com"
		const providerId = "prov_search_v2_nobase"
		const destinationId = "dest_nobase"
		const destinationSlug = "dest-nobase"
		const date = "2026-03-10"

		// Product C: has inventory + rate plan but NO PricingBaseRate.
		await seedHotelVariant({
			email,
			providerId,
			destinationId,
			destinationSlug,
			productId: "prod_c",
			variantId: "var_c1",
			baseRate: undefined,
			date,
			totalInventory: 2,
			ratePlanTemplateId: "rpt_c1",
			ratePlanId: "rp_c1",
		})

		const req = makeGetRequest(
			`/api/search-v2?destinationId=${encodeURIComponent(destinationId)}&checkIn=${encodeURIComponent(
				date
			)}&checkOut=${encodeURIComponent("2026-03-11")}&rooms=1&adults=2&children=0`
		)
		const res = await searchV2Get({ request: req } as any)
		expect(res.status).toBe(200)
		const json = await res.json()

		expect(json.results).toEqual([])
	})
})
