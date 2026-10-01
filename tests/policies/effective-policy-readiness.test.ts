import { describe, expect, it } from "vitest"
import {
	evaluateEffectivePolicyReadiness,
	policyBusinessContextFromProduct,
} from "@/lib/policies/policy-business-compatibility"

const context = (productType: string) =>
	policyBusinessContextFromProduct({ productId: "tour", productType })
const valid = [
	{
		category: "Cancellation",
		policy: {
			stayLengthType: "any",
			cancellationTiers: [{ hoursBeforeDeparture: 24, daysBeforeArrival: 0 }],
		},
	},
	{
		category: "Payment",
		policy: { rules: [{ ruleKey: "paymentType", ruleValue: "pay_at_property" }] },
	},
	{ category: "NoShow", policy: { rules: [{ ruleKey: "penaltyType", ruleValue: "full" }] } },
]
describe("effective conditions readiness", () => {
	it("counts an assigned hotel cancellation as invalid for tours and preserves the reason", () => {
		const entries = [
			{
				...valid[0],
				policy: { stayLengthType: "short", cancellationTiers: [{ daysBeforeArrival: 1 }] },
			},
			...valid.slice(1),
		]
		const result = evaluateEffectivePolicyReadiness(context("tour"), entries, [])
		expect(result.coverageCount).toBe(2)
		expect(result.isSellableByContract).toBe(false)
		expect(result.missingCategories).toEqual([])
		expect(result.invalidCategories).toEqual(["Cancellation"])
		expect(result.compatibilityIssues[0].code).toBe("tour_stay_length_policy_not_supported")
	})
	it("becomes 3/3 after explicit replacement without mutating old policies", () => {
		expect(evaluateEffectivePolicyReadiness(context("tour"), valid, [])).toMatchObject({
			coverageCount: 3,
			isSellableByContract: true,
		})
	})
	it("rejects prepayment and first-night no-show independently", () => {
		const entries = [
			valid[0],
			{
				category: "Payment",
				policy: { rules: [{ ruleKey: "paymentType", ruleValue: "prepayment" }] },
			},
			{
				category: "NoShow",
				policy: {
					refundBasis: "first_night",
					rules: [{ ruleKey: "penaltyType", ruleValue: "first_night" }],
				},
			},
		]
		expect(evaluateEffectivePolicyReadiness(context("tour"), entries, [])).toMatchObject({
			coverageCount: 1,
			invalidCategories: ["Payment", "NoShow"],
			isSellableByContract: false,
		})
	})
	it("preserves hotel rules and its four required categories", () => {
		const entries = [...valid, { category: "CheckIn", policy: {} }]
		expect(evaluateEffectivePolicyReadiness(context("hotel"), entries, [])).toMatchObject({
			coverageCount: 4,
			isSellableByContract: true,
			compatibilityIssues: [],
		})
	})
	it("does not hide forbidden extra categories behind full required coverage", () => {
		expect(
			evaluateEffectivePolicyReadiness(
				context("tour"),
				[...valid, { category: "CheckIn", policy: {} }],
				[]
			)
		).toMatchObject({
			coverageCount: 3,
			isSellableByContract: false,
			invalidCategories: ["CheckIn"],
		})
	})
	it("fails closed without a defined contract or resolved categories", () => {
		expect(evaluateEffectivePolicyReadiness(context("unknown"), [], []).isSellableByContract).toBe(
			false
		)
		expect(evaluateEffectivePolicyReadiness(context("tour"), [], []).coverageCount).toBe(0)
	})
})
