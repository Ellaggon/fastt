import { describe, expect, it } from "vitest"

import { evaluatePricingRuleEligibility } from "@/modules/pricing/domain/pricing-rule-eligibility"
import { evaluatePricingRules } from "@/modules/pricing/domain/evaluatePricingRules"

describe("pricing rule eligibility", () => {
	it("applies early bird discounts when booking lead time meets the threshold", () => {
		const result = evaluatePricingRuleEligibility({
			eligibility: { minLeadDays: 30 },
			stayContext: {
				requestDate: "2026-05-01",
				checkIn: "2026-06-15",
				checkOut: "2026-06-20",
			},
		})

		expect(result.applies).toBe(true)
		expect(result.explanation).toContain("booking is 45 days before check-in")
	})

	it("skips early bird discounts when booking lead time is too short", () => {
		const result = evaluatePricingRuleEligibility({
			eligibility: { minLeadDays: 30 },
			stayContext: {
				requestDate: "2026-06-01",
				checkIn: "2026-06-15",
				checkOut: "2026-06-20",
			},
		})

		expect(result.applies).toBe(false)
		expect(result.explanation).toContain("minimum is 30")
	})

	it("applies last-minute discounts inside the arrival window", () => {
		const result = evaluatePricingRuleEligibility({
			eligibility: { maxLeadDays: 3 },
			stayContext: {
				requestDate: "2026-06-12",
				checkIn: "2026-06-15",
				checkOut: "2026-06-17",
			},
		})

		expect(result.applies).toBe(true)
		expect(result.explanation).toContain("within 3-day arrival window")
	})

	it("skips LOS discounts when stay length is below threshold", () => {
		const result = evaluatePricingRuleEligibility({
			eligibility: { minNights: 5 },
			stayContext: {
				requestDate: "2026-06-01",
				checkIn: "2026-06-15",
				checkOut: "2026-06-18",
			},
		})

		expect(result.applies).toBe(false)
		expect(result.explanation).toContain("stay length is below 5 nights")
	})

	it("uses eligibility in pricing evaluation without changing base pricing semantics", () => {
		const result = evaluatePricingRules({
			basePrice: 100,
			date: "2026-06-15",
			stayContext: {
				requestDate: "2026-06-01",
				checkIn: "2026-06-15",
				checkOut: "2026-06-18",
			},
			includeEligibilityTrace: true,
			rules: [
				{
					id: "los",
					type: "percentage_discount",
					value: 20,
					priority: 10,
					eligibility: { minNights: 5 },
				},
			],
		})

		expect(result.price).toBe(100)
		expect(result.appliedRuleIds).toEqual([])
		expect(result.eligibilityTrace?.[0]?.applies).toBe(false)
		expect(result.eligibilityTrace?.[0]?.explanation).toContain("stay length is below 5 nights")
	})
})
