import { describe, expect, it, vi } from "vitest"

import { resolveSearchOffers } from "@/modules/search/application/use-cases/resolve-search-offers"
import type { SearchOffersRepositoryPort } from "@/modules/search/application/ports/SearchOffersRepository"
import { logger } from "@/lib/observability/logger"

function buildRepo(params: { v1Price: number; v2Price?: number }): SearchOffersRepositoryPort {
	return {
		async listActiveUnitsByProduct() {
			return [
				{
					id: "variant-1",
					productId: "product-1",
					kind: "hotel_room",
					pricing: { basePrice: params.v1Price, currency: "USD" },
					capacity: { minOccupancy: 1, maxOccupancy: 4 },
				},
			]
		},
		async listSearchUnitViewRows() {
			return [
				{
					variantId: "variant-1",
					ratePlanId: "rp-1",
					date: "2026-08-01",
					isSellable: true,
					isAvailable: true,
					hasAvailability: true,
					hasPrice: true,
					stopSell: false,
					availableUnits: 3,
					pricePerNight: params.v1Price,
					minStay: 1,
					cta: false,
					ctd: false,
					primaryBlocker: null,
				},
			]
		},
		async listEffectivePricingV2Rows() {
			if (params.v2Price == null) return []
			return [
				{
					variantId: "variant-1",
					ratePlanId: "rp-1",
					date: "2026-08-01",
					finalBasePrice: params.v2Price,
				},
			]
		},
	}
}

describe("resolveSearchOffers V2 shadow read", () => {
	it("keeps public response unchanged when V2 matches", async () => {
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {})
		const repo = buildRepo({ v1Price: 120, v2Price: 120 })
		const result = await resolveSearchOffers(
			{
				productId: "product-1",
				checkIn: new Date("2026-08-01T00:00:00.000Z"),
				checkOut: new Date("2026-08-02T00:00:00.000Z"),
				adults: 2,
				children: 0,
				rooms: 1,
				currency: "USD",
			},
			{ repo }
		)

		expect(result.reason).toBeUndefined()
		expect(result.offers).toHaveLength(1)
		expect(result.offers[0]?.ratePlans[0]?.finalPrice).toBe(120)
		expect(warnSpy).not.toHaveBeenCalled()
		warnSpy.mockRestore()
	})

	it("uses V2 as primary when V2 mismatches V1", async () => {
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {})
		const repo = buildRepo({ v1Price: 120, v2Price: 140 })
		const result = await resolveSearchOffers(
			{
				productId: "product-1",
				checkIn: new Date("2026-08-01T00:00:00.000Z"),
				checkOut: new Date("2026-08-02T00:00:00.000Z"),
				adults: 2,
				children: 0,
				rooms: 1,
				currency: "USD",
			},
			{ repo }
		)

		expect(result.offers).toHaveLength(1)
		expect(result.offers[0]?.ratePlans[0]?.finalPrice).toBe(140)
		expect(warnSpy).toHaveBeenCalledWith(
			"search.pricing.v2_shadow.summary",
			expect.objectContaining({
				totalEvaluated: 1,
				matches: 0,
				mismatches: 1,
				missing: 0,
			})
		)
		warnSpy.mockRestore()
	})

	it("fails explicitly when V2 row is missing", async () => {
		const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {})
		const repo = buildRepo({ v1Price: 120 })
		const result = await resolveSearchOffers(
			{
				productId: "product-1",
				checkIn: new Date("2026-08-01T00:00:00.000Z"),
				checkOut: new Date("2026-08-02T00:00:00.000Z"),
				adults: 2,
				children: 0,
				rooms: 1,
				currency: "USD",
			},
			{ repo }
		)

		expect(result.offers).toHaveLength(0)
		expect(result.reason).toBe("missing_view_price")
		expect(warnSpy).toHaveBeenCalledWith(
			"search.pricing.v2_shadow.summary",
			expect.objectContaining({
				totalEvaluated: 1,
				matches: 0,
				mismatches: 0,
				missing: 1,
			})
		)
		warnSpy.mockRestore()
	})
})
