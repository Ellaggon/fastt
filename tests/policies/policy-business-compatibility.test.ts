import { describe, expect, it } from "vitest"

import {
	evaluatePolicyBusinessCompatibility,
	policyBusinessContextFromProduct,
} from "@/lib/policies/policy-business-compatibility"

describe("policy business compatibility", () => {
	const tour = policyBusinessContextFromProduct({ productId: "tour-1", productType: "Tour" })
	const hotel = policyBusinessContextFromProduct({ productId: "hotel-1", productType: "Hotel" })

	it("accepts a tour policy only when it uses departure-relative cancellation and provider payment", () => {
		expect(
			evaluatePolicyBusinessCompatibility(tour, {
				category: "Cancellation",
				stayLengthType: "any",
				cancellationTiers: [
					{
						daysBeforeArrival: 1,
						hoursBeforeDeparture: 24,
						penaltyType: "percentage",
						penaltyAmount: 0,
					},
					{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
				],
			})
		).toEqual([])
		expect(
			evaluatePolicyBusinessCompatibility(tour, {
				category: "Payment",
				rules: { paymentType: "pay_at_property" },
			})
		).toEqual([])
	})

	it("rejects hotel-only categories, lead times, no-show bases and payments for tours", () => {
		const cases = [
			{
				candidate: { category: "CheckIn", rules: {} },
				code: "policy_category_not_supported",
			},
			{
				candidate: {
					category: "Cancellation",
					stayLengthType: "short_stay",
					cancellationTiers: [
						{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
					],
				},
				code: "tour_stay_length_policy_not_supported",
			},
			{
				candidate: {
					category: "Cancellation",
					stayLengthType: "any",
					cancellationTiers: [
						{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
					],
				},
				code: "tour_cancellation_requires_hour_cutoff",
			},
			{
				candidate: { category: "Payment", rules: { paymentType: "prepayment" } },
				code: "tour_payment_type_not_supported",
			},
			{
				candidate: { category: "NoShow", rules: { penaltyType: "first_night" } },
				code: "tour_no_show_basis_not_supported",
			},
			{
				candidate: {
					category: "NoShow",
					rules: { penaltyType: "full" },
					refundBasis: "first_night",
				},
				code: "tour_no_show_basis_not_supported",
			},
		]

		for (const entry of cases) {
			expect(evaluatePolicyBusinessCompatibility(tour, entry.candidate)[0]?.code).toBe(entry.code)
		}
	})

	it("does not change the established hotel policy contract", () => {
		expect(
			evaluatePolicyBusinessCompatibility(hotel, {
				category: "CheckIn",
				rules: { checkInFrom: "15:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
			})
		).toEqual([])
		expect(
			evaluatePolicyBusinessCompatibility(hotel, {
				category: "NoShow",
				rules: { penaltyType: "first_night" },
			})
		).toEqual([])
	})
})
