import { describe, expect, it } from "vitest"

import {
	mapRuleSnapshotToPolicyCards,
	mapRulesToPolicyViewModel,
	type RuleSnapshot,
} from "@/modules/rules/public"

function sampleRuleSnapshot(): RuleSnapshot {
	return {
		contractTerms: [
			{
				ruleId: "rule-cancel-v1",
				version: 1,
				category: "Cancellation",
				source: "policy",
				timestamp: "2030-01-01T00:00:00.000Z",
				content: {
					kind: "cancellation",
					description: "Flexible cancellation",
					tiers: [{ daysBeforeArrival: 2, penaltyType: "percentage", penaltyAmount: 0 }],
					rules: {},
				},
			},
			{
				ruleId: "rule-payment-v1",
				version: 1,
				category: "Payment",
				source: "policy",
				timestamp: "2030-01-01T00:00:00.000Z",
				content: {
					kind: "payment",
					description: "Pay at property",
					rules: { paymentType: "pay_at_property" },
				},
			},
			{
				ruleId: "rule-noshow-v1",
				version: 1,
				category: "NoShow",
				source: "policy",
				timestamp: "2030-01-01T00:00:00.000Z",
				content: {
					kind: "no_show",
					description: "No-show first night",
					rules: { penaltyType: "first_night" },
				},
			},
			{
				ruleId: "rule-checkin-v1",
				version: 1,
				category: "CheckIn",
				source: "policy",
				timestamp: "2030-01-01T00:00:00.000Z",
				content: {
					kind: "check_in",
					description: "Standard check-in",
					rules: { checkInFrom: "15:00", checkInUntil: "23:00" },
				},
			},
		],
		hardConstraintEvidence: [],
	}
}

describe("rules/mapRulesToPolicyViewModel", () => {
	it("builds rule-based summaries and score", () => {
		const mapped = mapRulesToPolicyViewModel(sampleRuleSnapshot())
		expect(mapped.cancellationSummary).toContain("Cancelación gratis")
		expect(mapped.paymentSummary).toContain("Pago en la propiedad")
		expect(mapped.noShowSummary).toContain("No-show")
		expect(mapped.checkInSummary).toContain("Check-in")
		expect(mapped.highlights.length).toBe(3)
		expect(mapped.flexibilityScore).toBeGreaterThan(0)
	})

	it("returns stable defaults when snapshot is missing", () => {
		const mapped = mapRulesToPolicyViewModel(null)
		expect(mapped.cancellationSummary).toBe("Cancelación según política")
		expect(mapped.paymentSummary).toBe("Pago según política")
		expect(mapped.noShowSummary).toBe("No-show según política")
		expect(mapped.checkInSummary).toBe("Check-in según política")
		expect(mapped.flexibilityScore).toBeGreaterThan(0)
	})

	it("maps rule snapshot to policy-card-compatible rows", () => {
		const rows = mapRuleSnapshotToPolicyCards(sampleRuleSnapshot())
		expect(rows.map((row) => row.category)).toEqual([
			"Cancellation",
			"Payment",
			"CheckIn",
			"NoShow",
		])
		expect(rows.every((row) => typeof row.description === "string")).toBe(true)
		expect(rows.every((row) => row.resolvedFromScope === "rate_plan")).toBe(true)
	})
})
