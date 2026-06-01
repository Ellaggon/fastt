import { describe, expect, it } from "vitest"

import { PolicyValidationError, validatePolicyContentForCategory } from "@/modules/policies/public"

describe("policies/policy content validation", () => {
	it("rejects invalid cancellation tiers centrally", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Cancellation",
				cancellationTiers: [
					{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 80 },
					{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 10 },
				],
			})
		).toThrow(PolicyValidationError)
	})

	it("requires structured payment rules for prepayment", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Payment",
				rules: { paymentType: "prepayment" },
			})
		).toThrow(PolicyValidationError)

		expect(
			validatePolicyContentForCategory({
				category: "Payment",
				rules: { paymentType: "prepayment", prepaymentPercentage: 50 },
			}).rules
		).toEqual({ paymentType: "prepayment", prepaymentPercentage: 50 })
	})

	it("validates check-in times and ordering", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "CheckIn",
				rules: { checkInFrom: "23:00", checkInUntil: "15:00", checkOutUntil: "11:00" },
			})
		).toThrow(PolicyValidationError)
	})

	it("requires no-show percentage amount when percentage is selected", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "NoShow",
				rules: { penaltyType: "percentage" },
			})
		).toThrow(PolicyValidationError)
	})
})
