import { describe, it, expect } from "vitest"
import { PricingEngine } from "@/core/pricing/PricingEngine"
import { adaptPriceRule } from "@/core/pricing/adapters/adapter.priceRule"

describe("Pricing Engine Math", () => {
	it("applies rateplan correctly", () => {
		const engine = new PricingEngine()

		const result = engine.computeStay({
			basePrice: 100,
			nights: 2,
			currency: "USD",
			rules: [
				{
					id: "rule1",
					rule: {
						type: "percentage",
						value: -10, // descuento 10%
					},
				},
			],
		})

		expect(result.total).toBe(180)
	})
})

describe("PriceRule Adapter", () => {
	it("converts percentage_discount correctly", () => {
		const dbRule = {
			id: "1",
			type: "percentage_discount",
			value: 10,
			isActive: true,
		}

		const result = adaptPriceRule(dbRule)

		expect(result?.rule.type).toBe("percentage")
		expect(result?.rule.value).toBe(-10)
	})

	it("ignores inactive rules", () => {
		const dbRule = {
			id: "1",
			type: "percentage_discount",
			value: 10,
			isActive: false,
		}

		const result = adaptPriceRule(dbRule)

		expect(result).toBeNull()
	})
})

describe("Pricing Engine + Adapter", () => {
	it("applies discount correctly", () => {
		const dbRule = {
			id: "1",
			type: "percentage_discount",
			value: 10,
			isActive: true,
		}

		const adapted = adaptPriceRule(dbRule)

		const engine = new PricingEngine()

		const result = engine.computeStay({
			basePrice: 100,
			nights: 2,
			currency: "USD",
			rules: adapted ? [adapted] : [],
		})

		expect(result.total).toBe(180)
	})
})
