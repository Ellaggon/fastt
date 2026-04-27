import { describe, expect, it } from "vitest"

import {
	classifyRulesUiMismatchSeverity,
	getRulesUiDailySummary,
	recordRulesUiEvaluation,
	recordRulesUiFallback,
	recordRulesUiMismatch,
} from "@/lib/observability/rules-ui-validation"

describe("rules-ui validation severity", () => {
	it("classifies cancellation/payment as CRITICAL", () => {
		expect(
			classifyRulesUiMismatchSeverity({
				category: "cancellation",
				type: "value_mismatch",
				details: "tiers differ",
			})
		).toBe("CRITICAL")
		expect(
			classifyRulesUiMismatchSeverity({
				category: "payment",
				type: "value_mismatch",
				details: "rules payload differs",
			})
		).toBe("CRITICAL")
	})

	it("classifies timing differences as MEDIUM", () => {
		expect(
			classifyRulesUiMismatchSeverity({
				category: "check_in",
				type: "value_mismatch",
				details: "effective timing window differs",
			})
		).toBe("MEDIUM")
	})

	it("classifies metadata differences as LOW", () => {
		expect(
			classifyRulesUiMismatchSeverity({
				category: "no_show",
				type: "structure_mismatch",
				details: "metadata formatting differs",
			})
		).toBe("LOW")
	})
})

describe("rules-ui daily summary", () => {
	it("aggregates enabled/fallback/mismatch rates and top groups", () => {
		const ts = new Date("2035-01-12T10:00:00.000Z")
		const day = "2035-01-12"

		recordRulesUiEvaluation({
			endpoint: "tests.rules.validation",
			hotelId: "hotel-a",
			supplierId: "supplier-a",
			ratePlanId: "rp-a",
			sessionHash: "session-a",
			enabled: true,
			rolloutPercentage: 50,
			rolloutBucket: 10,
			timestamp: ts,
		})
		recordRulesUiEvaluation({
			endpoint: "tests.rules.validation",
			hotelId: "hotel-b",
			supplierId: "supplier-b",
			ratePlanId: "rp-b",
			sessionHash: "session-b",
			enabled: false,
			rolloutPercentage: 50,
			rolloutBucket: 80,
			timestamp: ts,
		})
		recordRulesUiFallback({
			endpoint: "tests.rules.validation",
			hotelId: "hotel-a",
			supplierId: "supplier-a",
			ratePlanId: "rp-a",
			sessionHash: "session-a",
			reason: "mismatch_detected",
			timestamp: ts,
		})
		recordRulesUiMismatch({
			endpoint: "tests.rules.validation",
			hotelId: "hotel-a",
			supplierId: "supplier-a",
			ratePlanId: "rp-a",
			sessionHash: "session-a",
			input: {
				checkIn: "2035-01-20",
				checkOut: "2035-01-22",
				variantId: "variant-a",
				channel: "web",
			},
			mismatches: [
				{
					category: "cancellation",
					type: "value_mismatch",
					details: "tiers differ",
				},
			],
			policySnapshot: { cancellation: { description: "Policy" } },
			ruleSnapshot: { contractTerms: [{ category: "Cancellation" }] },
			timestamp: ts,
		})

		const summary = getRulesUiDailySummary(day)
		expect(summary.totalRequests).toBeGreaterThanOrEqual(2)
		expect(summary.rulesEnabledPct).toBeGreaterThan(0)
		expect(summary.fallbackPct).toBeGreaterThan(0)
		expect(summary.mismatchPct).toBeGreaterThan(0)
		expect(summary.topMismatchCategories[0]?.category).toBe("cancellation")
		expect(summary.topAffectedHotels[0]?.hotelId).toBe("hotel-a")
		expect(summary.topAffectedSuppliers[0]?.supplierId).toBe("supplier-a")
		expect(summary.topAffectedRatePlans[0]?.ratePlanId).toBe("rp-a")
		expect(summary.byRates.byHotel.length).toBeGreaterThan(0)
		expect(summary.byRates.bySupplier.length).toBeGreaterThan(0)
		expect(summary.byRates.byRatePlan.length).toBeGreaterThan(0)
	})
})
