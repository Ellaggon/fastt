import { describe, expect, it, vi } from "vitest"

import { computeEffectivePricingV2 } from "@/modules/pricing/application/use-cases/compute-effective-pricing-v2"

const input = {
	variantId: "variant-1",
	ratePlanId: "rate-plan-1",
	date: "2026-06-22",
	occupancy: { adults: 2, children: 0, infants: 0 },
}

describe("effective pricing without a baseline", () => {
	it("materializes a date when an applicable fixed price establishes its final value", async () => {
		const getFallbackCurrency = vi.fn().mockResolvedValue("BOB")
		const result = await computeEffectivePricingV2(
			{
				getBaseFromPolicy: vi.fn().mockResolvedValue(null),
				getActiveOccupancyPolicy: vi.fn().mockResolvedValue(null),
				getFallbackCurrency,
				getPreviewRules: vi.fn().mockResolvedValue([
					{
						id: "fixed-1",
						type: "fixed_override",
						value: 120,
						priority: 1000,
						dateRangeJson: { from: "2026-06-22", to: "2026-06-23" },
						dayOfWeekJson: null,
						createdAt: new Date("2026-06-18T00:00:00.000Z"),
					},
				]),
			},
			input
		)

		expect(result.currency).toBe("BOB")
		expect(result.breakdown.base).toBe(0)
		expect(result.breakdown.final).toBe(120)
		expect(getFallbackCurrency).toHaveBeenCalledWith("rate-plan-1")
	})

	it("keeps rejecting percentage adjustments when no base price exists", async () => {
		await expect(
			computeEffectivePricingV2(
				{
					getBaseFromPolicy: vi.fn().mockResolvedValue(null),
					getActiveOccupancyPolicy: vi.fn().mockResolvedValue(null),
					getPreviewRules: vi.fn().mockResolvedValue([
						{
							id: "discount-1",
							type: "percentage_discount",
							value: 10,
							priority: 100,
							dateRangeJson: { from: "2026-06-22", to: "2026-06-23" },
							dayOfWeekJson: null,
							createdAt: new Date("2026-06-18T00:00:00.000Z"),
						},
					]),
				},
				input
			)
		).rejects.toThrow("POLICY_BASE_NOT_FOUND")
	})
})
