import { describe, it, expect, vi } from "vitest"
import {
	computeAndPersistDailyPrice,
	type ComputeAndPersistDailyPriceDeps,
} from "@/modules/pricing/public"

describe("pricing/use-cases/computeAndPersistDailyPrice", () => {
	it("loads rules, computes daily price, and persists effective price", async () => {
		const rules = [
			{
				id: "rule1",
				rule: { type: "percentage" as const, value: -10 },
			},
		]

		const getRules = vi.fn(async () => rules)

		const saveEffectivePrice = vi.fn(async () => {})
		const computeDaily = vi.fn(() => ({ total: 123 }))

		const deps: ComputeAndPersistDailyPriceDeps = {
			pricingRepo: { getRules, saveEffectivePrice },
			pricingEngine: { computeDaily } as any,
		}

		await computeAndPersistDailyPrice(deps, {
			variantId: "v1",
			ratePlanId: "rp1",
			date: "2026-03-10",
			basePrice: 100,
		})

		expect(getRules).toHaveBeenCalledTimes(1)
		expect(getRules).toHaveBeenCalledWith("rp1")

		expect(computeDaily).toHaveBeenCalledTimes(1)
		expect(computeDaily).toHaveBeenCalledWith({
			basePrice: 100,
			rules,
			currency: "USD",
		})

		expect(saveEffectivePrice).toHaveBeenCalledTimes(1)
		expect(saveEffectivePrice).toHaveBeenCalledWith({
			variantId: "v1",
			ratePlanId: "rp1",
			date: "2026-03-10",
			basePrice: 100,
			finalBasePrice: 123,
		})
	})
})
