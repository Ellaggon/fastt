import { describe, it, expect, vi } from "vitest"
import { selectBestRatePlan, type SelectBestRatePlanDeps } from "@/modules/pricing/public"

describe("pricing/use-cases/selectBestRatePlan", () => {
	it("throws when variant is not found", async () => {
		const deps: SelectBestRatePlanDeps = {
			variantRepo: { getById: vi.fn(async () => null) },
			ratePlanRepo: {
				getActiveByVariant: vi.fn(async () => []),
				getDefaultByVariant: vi.fn(async () => null),
			},
			priceRuleRepo: { getActive: vi.fn(async () => []) },
			ratePlanEngine: { selectFromMemory: vi.fn(() => []) } as any,
		}

		await expect(
			selectBestRatePlan(deps, {
				variantId: "v1",
				checkIn: new Date("2026-03-10"),
				checkOut: new Date("2026-03-11"),
			})
		).rejects.toThrow("Variant not found")
	})

	it("returns empty candidates when there are no active rate plans", async () => {
		const deps: SelectBestRatePlanDeps = {
			variantRepo: {
				getById: vi.fn(async () => ({
					id: "v1",
					productId: "p1",
					entityType: "hotel_room",
					entityId: "hr1",
					basePrice: 100,
				})),
			},
			ratePlanRepo: {
				getActiveByVariant: vi.fn(async () => []),
				getDefaultByVariant: vi.fn(async () => null),
			},
			priceRuleRepo: { getActive: vi.fn(async () => []) },
			ratePlanEngine: { selectFromMemory: vi.fn(() => []) } as any,
		}

		const out = await selectBestRatePlan(deps, {
			variantId: "v1",
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
		})

		expect(out).toEqual({ best: null, candidates: [] })
		expect(deps.priceRuleRepo.getActive).not.toHaveBeenCalled()
		expect((deps.ratePlanEngine as any).selectFromMemory).not.toHaveBeenCalled()
	})

	it("loads price rules per plan and delegates to engine with basePrice fallback", async () => {
		const ratePlans = [{ id: "rp1" }, { id: "rp2" }]
		const priceRulesForRp1 = [{ id: "r1" }]
		const priceRulesForRp2 = [{ id: "r2" }]

		const selectFromMemory = vi.fn(() => [
			{ id: "rp2", name: "Best", price: 90, priority: 10 },
			{ id: "rp1", name: "Other", price: 100, priority: 5 },
		])

		const deps: SelectBestRatePlanDeps = {
			variantRepo: {
				getById: vi.fn(async () => ({
					id: "v1",
					productId: "p1",
					entityType: "hotel_room",
					entityId: "hr1",
					basePrice: null,
				})),
			},
			ratePlanRepo: {
				getActiveByVariant: vi.fn(async () => ratePlans),
				getDefaultByVariant: vi.fn(async () => null),
			},
			priceRuleRepo: {
				getActive: vi.fn(async (ratePlanId: string) => {
					if (ratePlanId === "rp1") return priceRulesForRp1
					if (ratePlanId === "rp2") return priceRulesForRp2
					return []
				}),
			},
			ratePlanEngine: { selectFromMemory } as any,
		}

		const checkIn = new Date("2026-03-10")
		const out = await selectBestRatePlan(deps, {
			variantId: "v1",
			checkIn,
			checkOut: new Date("2026-03-11"),
		})

		expect(deps.priceRuleRepo.getActive).toHaveBeenCalledTimes(2)
		expect(deps.priceRuleRepo.getActive).toHaveBeenNthCalledWith(1, "rp1")
		expect(deps.priceRuleRepo.getActive).toHaveBeenNthCalledWith(2, "rp2")

		expect(selectFromMemory).toHaveBeenCalledTimes(1)
		expect(selectFromMemory).toHaveBeenCalledWith({
			ratePlans,
			priceRules: [priceRulesForRp1, priceRulesForRp2],
			basePrice: 0,
			checkIn,
		})

		expect(out.candidates).toHaveLength(2)
		expect(out.best?.id).toBe("rp2")
	})
})
