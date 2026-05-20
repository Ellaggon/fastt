import { describe, expect, it, vi } from "vitest"

import { evaluatePricingRules } from "@/modules/pricing/domain/evaluatePricingRules"

describe("pricing rules runtime logging", () => {
	it("does not emit console.debug/log spam while evaluating rules", () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined)
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)

		const result = evaluatePricingRules({
			basePrice: 100,
			date: "2026-12-10",
			ratePlanId: "rp_test",
			occupancyKey: "a2_c0_i0",
			rules: [
				{ id: "r1", type: "fixed_adjustment", value: 10, priority: 1, createdAt: new Date() },
				{ id: "r2", type: "percentage_markup", value: 5, priority: 2, createdAt: new Date() },
			],
			includeBreakdown: true,
		})

		expect(result.price).toBe(115.5)
		expect(debugSpy).not.toHaveBeenCalled()
		expect(logSpy).not.toHaveBeenCalled()

		debugSpy.mockRestore()
		logSpy.mockRestore()
	})

	it("lets a later same-day fixed override win over an earlier same-priority override", () => {
		const result = evaluatePricingRules({
			basePrice: 100,
			date: "2026-05-20",
			ratePlanId: "rp_test",
			occupancyKey: "a2_c0_i0",
			rules: [
				{
					id: "old-manual",
					type: "fixed_override",
					value: 15,
					priority: 1000,
					dateRange: { from: "2026-05-20", to: "2026-05-20" },
					createdAt: new Date("2026-05-19T10:00:00.000Z"),
				},
				{
					id: "new-manual",
					type: "fixed_override",
					value: 20,
					priority: 1000,
					dateRange: { from: "2026-05-20", to: "2026-05-20" },
					createdAt: new Date("2026-05-19T10:05:00.000Z"),
				},
			],
		})

		expect(result.price).toBe(20)
	})
})
