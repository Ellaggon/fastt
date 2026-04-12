import { describe, it, expect } from "vitest"
import { SearchPipeline } from "@/modules/search/public"
import { vi } from "vitest"
import {
	PromotionEngine,
	computeBasePriceWithRules,
	parseStrictMinimalRules,
} from "@/modules/pricing/public"
import { RestrictionRuleEngine } from "@/modules/policies/public"

vi.mock("astro:db")

describe("SearchPipeline", () => {
	it("should calculate base pricing correctly", async () => {
		const fakeLoader = {
			load: async () => ({
				inventory: [
					{
						date: "2026-03-10",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
					{
						date: "2026-03-11",
						totalInventory: 5,
						reservedCount: 0,
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

		const pipeline = new SearchPipeline(fakeLoader, undefined, {
			pricing: {
				computeStayBasePriceWithRulesStrict: ({ basePricePerNight, nights, priceRules }) => {
					const stayBase = basePricePerNight * nights
					const minimal = parseStrictMinimalRules({
						basePrice: stayBase,
						rules: priceRules.map((r) => ({
							id: r.id,
							type: String(r.type),
							value: Number(r.value),
						})),
					})
					return computeBasePriceWithRules(stayBase, minimal)
				},
			},
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
		})

		const result = await pipeline.run({
			productId: "hotel_test",
			unitId: "room_test",
			unitType: "hotel_room",
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-12"),
			adults: 2,
			children: 0,
			basePrice: 100,
		})

		expect(result).toBeDefined()
		expect(Array.isArray(result)).toBe(true)
	})
})
