import { describe, it, expect } from "vitest"
import { SearchPipeline } from "@/modules/search/public"
import {
	PromotionEngine,
	computeBasePriceWithRules,
	parseStrictMinimalRules,
} from "@/modules/pricing/public"
import { RestrictionRuleEngine } from "@/modules/policies/public"

const baseDate = new Date("2026-03-01")

describe("SearchPipeline E2E", () => {
	it("returns valid offer with discount", async () => {
		// 🔹 Fake loader
		const fakeLoader: any = {
			load: async () => ({
				inventory: [
					{
						date: "2026-03-01",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
					{
						date: "2026-03-02",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
				],
				ratePlans: [{ id: "rp1" }],
				priceRules: [
					{
						id: "rule1",
						ratePlanId: "rp1",
						type: "percentage",
						value: -10,
						isActive: true,
					},
				],
				restrictions: [],
				promotions: [],
			}),
		}

		const restrictionEngine = new RestrictionRuleEngine()
		const promotionEngine = new PromotionEngine()
		const taxPort = {
			resolveEffectiveTaxFees: async () => ({ definitions: [] }),
			computeTaxBreakdown: ({ base }: { base: number }) => ({
				base,
				taxes: { included: [], excluded: [] },
				fees: { included: [], excluded: [] },
				total: base,
			}),
		}

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
			taxes: taxPort,
		})

		const result = await pipeline.run({
			productId: "p1",
			unitId: "u1",
			unitType: "hotel_room",
			checkIn: new Date(baseDate),
			checkOut: new Date("2026-03-03"),
			adults: 2,
			children: 0,
			basePrice: 100,
		})

		expect(result.length).toBe(1)

		expect(result[0].basePrice).toBe(180)
		expect(result[0].finalPrice).toBe(180)
	})

	it("applies promotion after pricing", async () => {
		const fakeLoader: any = {
			load: async () => ({
				inventory: [
					{
						date: "2026-03-01",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
					{
						date: "2026-03-02",
						totalInventory: 5,
						reservedCount: 0,
						stopSell: false,
					},
				],
				ratePlans: [{ id: "rp1" }],
				priceRules: [],
				restrictions: [],
				promotions: [
					{
						id: "promo1",
						type: "percentage",
						value: 10,
						startDate: new Date("2025-01-01"),
						endDate: new Date("2030-01-01"),
						combinable: true,
					},
				],
			}),
		}

		const restrictionEngine = new RestrictionRuleEngine()
		const promotionEngine = new PromotionEngine()
		const taxPort = {
			resolveEffectiveTaxFees: async () => ({ definitions: [] }),
			computeTaxBreakdown: ({ base }: { base: number }) => ({
				base,
				taxes: { included: [], excluded: [] },
				fees: { included: [], excluded: [] },
				total: base,
			}),
		}

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
			taxes: taxPort,
		})

		const result = await pipeline.run({
			productId: "p1",
			unitId: "u1",
			unitType: "hotel_room",
			checkIn: new Date(baseDate),
			checkOut: new Date("2026-03-03"),
			adults: 2,
			children: 0,
			basePrice: 100,
		})

		// 200 total base
		// -10% promo = 180

		expect(result[0].finalPrice).toBe(180)
	})
})
