import { describe, expect, it, vi } from "vitest"

import { ensurePricingCoverage } from "@/modules/pricing/application/use-cases/ensure-pricing-coverage"

describe("ensurePricingCoverage scalability and exactness", () => {
	it("covers long date ranges without truncating combinations", async () => {
		const saveEffectivePricingV2 = vi.fn(async () => undefined)
		const getPreviewRules = vi.fn(async () => [])

		const result = await ensurePricingCoverage(
			{
				pricingRepo: {
					getPreviewRules,
				} as any,
				variantRepo: {
					getDefaultRatePlanWithRules: vi.fn(),
					getCapacity: vi.fn(async () => ({ maxOccupancy: 4, maxAdults: 3, maxChildren: 2 })),
				} as any,
				pricingV2Repo: {
					getBaseFromPolicy: vi.fn(async () => ({ baseAmount: 100, currency: "USD" })),
					getActiveOccupancyPolicy: vi.fn(async () => ({
						baseAdults: 2,
						baseChildren: 0,
						extraAdultMode: "fixed",
						extraAdultValue: 10,
						childMode: "fixed",
						childValue: 5,
						currency: "USD",
					})),
					saveEffectivePricingV2,
					listEffectivePricingV2Combinations: vi.fn(async () => []),
				} as any,
			},
			{
				variantId: "v1",
				ratePlanId: "rp1",
				from: "2026-01-01",
				to: "2026-02-15",
				recomputeExisting: false,
			}
		)

		// 45 nights × 8 occupancy combinations (capacity-constrained set)
		expect(result).toEqual({ missingDatesCount: 0, generatedDatesCount: 45 })
		expect(saveEffectivePricingV2).toHaveBeenCalledTimes(360)
	})

	it("handles multiple occupancy keys explicitly for same date range", async () => {
		const saveEffectivePricingV2 = vi.fn(async () => undefined)
		const getPreviewRules = vi.fn(async () => [])

		await ensurePricingCoverage(
			{
				pricingRepo: { getPreviewRules } as any,
				variantRepo: {
					getDefaultRatePlanWithRules: vi.fn(),
					getCapacity: vi.fn(async () => ({ maxOccupancy: 6, maxAdults: 6, maxChildren: 4 })),
				} as any,
				pricingV2Repo: {
					getBaseFromPolicy: vi.fn(async () => ({ baseAmount: 100, currency: "USD" })),
					getActiveOccupancyPolicy: vi.fn(async () => ({
						baseAdults: 2,
						baseChildren: 0,
						extraAdultMode: "fixed",
						extraAdultValue: 10,
						childMode: "fixed",
						childValue: 5,
						currency: "USD",
					})),
					saveEffectivePricingV2,
					listEffectivePricingV2Combinations: vi.fn(async () => []),
				} as any,
			},
			{
				variantId: "v2",
				ratePlanId: "rp2",
				from: "2026-03-01",
				to: "2026-03-03",
				recomputeExisting: false,
				maxOccupancyCombinations: 4,
			}
		)

		// 2 nights × 4 occupancy combinations (explicit configured cap)
		expect(saveEffectivePricingV2).toHaveBeenCalledTimes(8)
	})

	it("batches recompute by chunk size while preserving full coverage", async () => {
		const saveEffectivePricingV2 = vi.fn(async () => undefined)
		const listEffectivePricingV2Combinations = vi.fn(async () => [])

		await ensurePricingCoverage(
			{
				pricingRepo: { getPreviewRules: vi.fn(async () => []) } as any,
				variantRepo: {
					getDefaultRatePlanWithRules: vi.fn(),
					getCapacity: vi.fn(async () => ({ maxOccupancy: 2, maxAdults: 2, maxChildren: 0 })),
				} as any,
				pricingV2Repo: {
					getBaseFromPolicy: vi.fn(async () => ({ baseAmount: 100, currency: "USD" })),
					getActiveOccupancyPolicy: vi.fn(async () => ({
						baseAdults: 2,
						baseChildren: 0,
						extraAdultMode: "fixed",
						extraAdultValue: 0,
						childMode: "fixed",
						childValue: 0,
						currency: "USD",
					})),
					saveEffectivePricingV2,
					listEffectivePricingV2Combinations,
				} as any,
			},
			{
				variantId: "v3",
				ratePlanId: "rp3",
				from: "2026-04-01",
				to: "2026-04-11",
				recomputeExisting: false,
				recomputeChunkSizeDays: 3,
			}
		)

		// capacity 2 with maxChildren=0 => combos: (1,0), (2,0) => 2
		// 10 nights × 2 combos
		expect(saveEffectivePricingV2).toHaveBeenCalledTimes(20)
		expect(listEffectivePricingV2Combinations).toHaveBeenCalledTimes(1)
	})

	it("recomputes only missing combinations and avoids drift in complete reads", async () => {
		const saveEffectivePricingV2 = vi.fn(async () => undefined)

		const result = await ensurePricingCoverage(
			{
				pricingRepo: { getPreviewRules: vi.fn(async () => []) } as any,
				variantRepo: {
					getDefaultRatePlanWithRules: vi.fn(),
					getCapacity: vi.fn(async () => ({ maxOccupancy: 2, maxAdults: 2, maxChildren: 0 })),
				} as any,
				pricingV2Repo: {
					getBaseFromPolicy: vi.fn(async () => ({ baseAmount: 100, currency: "USD" })),
					getActiveOccupancyPolicy: vi.fn(async () => ({
						baseAdults: 2,
						baseChildren: 0,
						extraAdultMode: "fixed",
						extraAdultValue: 0,
						childMode: "fixed",
						childValue: 0,
						currency: "USD",
					})),
					saveEffectivePricingV2,
					listEffectivePricingV2Combinations: vi.fn(async () => [
						{ date: "2026-05-01", occupancyKey: "a1_c0_i0" },
						{ date: "2026-05-01", occupancyKey: "a2_c0_i0" },
						{ date: "2026-05-01", occupancyKey: "a1_c1_i0" },
					]),
				} as any,
			},
			{
				variantId: "v4",
				ratePlanId: "rp4",
				from: "2026-05-01",
				to: "2026-05-02",
				recomputeExisting: false,
			}
		)

		expect(result).toEqual({ missingDatesCount: 0, generatedDatesCount: 0 })
		expect(saveEffectivePricingV2).not.toHaveBeenCalled()
	})
})
