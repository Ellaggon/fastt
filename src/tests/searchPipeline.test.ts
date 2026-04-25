import { describe, it, expect } from "vitest"
import { SearchPipeline } from "@/modules/search/public"
import { vi } from "vitest"
import { PromotionEngine } from "@/modules/pricing/public"
import { RestrictionRuleEngine } from "@/modules/policies/public"

describe("SearchPipeline", () => {
	it("should calculate base pricing correctly", async () => {
		const fakeLoader = {
			load: async () => ({
				inventory: [
					{
						date: "2026-03-10",
						availableUnits: 5,
						isSellable: true,
						stopSell: false,
					},
					{
						date: "2026-03-11",
						availableUnits: 5,
						isSellable: true,
						stopSell: false,
					},
				],
				ratePlans: [],
				restrictions: [],
				priceRules: [],
				promotions: [],
			}),
		}

		const restrictionEngine = new RestrictionRuleEngine()
		const promotionEngine = new PromotionEngine()

		const pipeline = new SearchPipeline(fakeLoader, {
			restrictions: {
				evaluateFromMemory: (ctx) => restrictionEngine.evaluateFromMemory(ctx),
			},
			promotions: {
				applyPromotions: (basePrice, promotions, ctx) =>
					promotionEngine.applyPromotions(basePrice, promotions, ctx),
			},
			taxes: {
				resolveEffectiveTaxFees: async () => ({ definitions: [] }),
				computeTaxBreakdown: ({ base }) => ({
					base,
					taxes: { included: [], excluded: [] },
					fees: { included: [], excluded: [] },
					total: base,
				}),
			},
			effectivePricing: {
				getEffectiveTotalForRange: async () => ({ total: 200, missingDates: [] }),
			},
		})

		const result = await pipeline.run({
			productId: "hotel_test",
			unitId: "room_test",
			unitType: "hotel_room",
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-12"),
			adults: 2,
			children: 0,
		})

		expect(result).toBeDefined()
		expect(Array.isArray(result)).toBe(true)
	})
})
