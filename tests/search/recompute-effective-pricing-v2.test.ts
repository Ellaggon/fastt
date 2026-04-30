import { describe, expect, it } from "vitest"

import { recomputeEffectivePricingV2Range } from "@/modules/pricing/application/use-cases/recompute-effective-pricing-v2"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

describe("recomputeEffectivePricingV2Range", () => {
	it("genera múltiples occupancyKey por fecha y mantiene final >= 0", async () => {
		const saved: Array<any> = []
		const result = await recomputeEffectivePricingV2Range(
			{
				getActiveOccupancyPolicy: async () => ({
					baseAdults: 2,
					baseChildren: 0,
					extraAdultMode: "fixed",
					extraAdultValue: 15,
					childMode: "fixed",
					childValue: 10,
					currency: "USD",
				}),
				getBaseFromPolicy: async () => ({ baseAmount: 100, currency: "USD" }),
				getPreviewRules: async () => [],
				saveEffectivePricingV2: async (row) => {
					saved.push(row)
				},
			},
			{
				variantId: "var_1",
				ratePlanId: "rp_1",
				dates: ["2026-01-01", "2026-01-02"],
			}
		)

		expect(result.rows).toBe(8)
		expect(result.occupancyKeys).toEqual([
			buildOccupancyKey({ adults: 1, children: 0, infants: 0 }),
			buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
			buildOccupancyKey({ adults: 2, children: 1, infants: 0 }),
			buildOccupancyKey({ adults: 3, children: 0, infants: 0 }),
		])
		expect(saved).toHaveLength(8)
		for (const row of saved) {
			expect(Number(row.finalBasePrice)).toBeGreaterThanOrEqual(0)
		}
	})

	it("aplica reglas globales y scoped por occupancyKey de forma determinística", async () => {
		const saved: Array<any> = []
		await recomputeEffectivePricingV2Range(
			{
				getActiveOccupancyPolicy: async () => ({
					baseAdults: 2,
					baseChildren: 0,
					extraAdultMode: "fixed",
					extraAdultValue: 15,
					childMode: "fixed",
					childValue: 0,
					currency: "USD",
				}),
				getBaseFromPolicy: async () => ({ baseAmount: 100, currency: "USD" }),
				getPreviewRules: async () => [
					{
						id: "rule_global",
						type: "fixed_adjustment",
						value: 5,
						priority: 10,
						dateRangeJson: null,
						dayOfWeekJson: null,
						createdAt: new Date("2026-01-01T00:00:00.000Z"),
					},
					{
						id: "rule_occ_a3",
						type: "percentage_markup",
						value: 10,
						occupancyKey: buildOccupancyKey({ adults: 3, children: 0, infants: 0 }),
						priority: 20,
						dateRangeJson: null,
						dayOfWeekJson: null,
						createdAt: new Date("2026-01-01T00:00:01.000Z"),
					},
				],
				saveEffectivePricingV2: async (row) => {
					saved.push(row)
				},
			},
			{
				variantId: "var_occ_scope",
				ratePlanId: "rp_occ_scope",
				dates: ["2026-03-10"],
				occupancies: [
					{ adults: 2, children: 0, infants: 0 },
					{ adults: 3, children: 0, infants: 0 },
				],
			}
		)

		const a2 = saved.find(
			(row) => row.occupancyKey === buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
		)
		const a3 = saved.find(
			(row) => row.occupancyKey === buildOccupancyKey({ adults: 3, children: 0, infants: 0 })
		)
		expect(a2).toBeTruthy()
		expect(a3).toBeTruthy()
		expect(Number(a2.ruleAdjustment)).toBe(5)
		expect(Number(a3.ruleAdjustment)).toBe(17)
		expect(Number(a3.finalBasePrice)).toBeGreaterThan(Number(a2.finalBasePrice))
	})
})
