import { describe, expect, it } from "vitest"

import {
	buildRuleBasedContractSnapshot,
	comparePolicyContractVsRuleContract,
	type RuleSnapshot,
} from "@/modules/rules/public"
import type { HoldPolicySnapshot } from "@/modules/policies/public"

function policyFixture(): HoldPolicySnapshot {
	return {
		cancellation: {
			category: "cancellation",
			policyId: "pol-cancel-v1",
			groupId: "grp-cancel",
			version: 1,
			description: "Flexible cancellation",
			resolvedFromScope: "rate_plan",
			rules: [],
			cancellationTiers: [{ daysBeforeArrival: 2, penaltyType: "percentage", penaltyAmount: 0 }],
		},
		payment: {
			category: "payment",
			policyId: "pol-payment-v1",
			groupId: "grp-payment",
			version: 1,
			description: "Pay at property",
			resolvedFromScope: "rate_plan",
			rules: [
				{ ruleKey: "paymentType", ruleValue: "pay_at_property" },
				{ ruleKey: "prepaymentPercentage", ruleValue: 0 },
			],
			cancellationTiers: [],
		},
		no_show: {
			category: "no_show",
			policyId: "pol-noshow-v1",
			groupId: "grp-noshow",
			version: 1,
			description: "No-show first night",
			resolvedFromScope: "rate_plan",
			rules: [{ ruleKey: "penaltyType", ruleValue: "first_night" }],
			cancellationTiers: [],
		},
		check_in: {
			category: "check_in",
			policyId: "pol-checkin-v1",
			groupId: "grp-checkin",
			version: 1,
			description: "Standard check-in",
			resolvedFromScope: "rate_plan",
			rules: [{ ruleKey: "checkInFrom", ruleValue: "15:00" }],
			cancellationTiers: [],
		},
		meta: {
			policyVersionIds: ["pol-cancel-v1", "pol-payment-v1", "pol-noshow-v1", "pol-checkin-v1"],
			resolvedAt: "2030-01-01T00:00:00.000Z",
			checkIn: "2030-01-10",
			checkOut: "2030-01-12",
			channel: "web",
		},
	}
}

function ruleFixture(): RuleSnapshot {
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
					rules: { paymentType: "pay_at_property", prepaymentPercentage: 0 },
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
					rules: { checkInFrom: "15:00" },
				},
			},
		],
		hardConstraintEvidence: [],
	}
}

describe("rules/comparePolicyContractVsRuleContract", () => {
	it("returns consistent for equivalent policy/rule contracts", () => {
		const policy = policyFixture()
		const ruleSnapshot = ruleFixture()
		const shadowContract = buildRuleBasedContractSnapshot({
			ruleSnapshot,
			checkIn: "2030-01-10",
			checkOut: "2030-01-12",
			channel: "web",
		})

		const compared = comparePolicyContractVsRuleContract(policy, shadowContract)
		expect(compared.isConsistent).toBe(true)
		expect(compared.diffs).toEqual([])
	})

	it("detects payment timing mismatches", () => {
		const policy = policyFixture()
		const ruleSnapshot = ruleFixture()
		;(ruleSnapshot.contractTerms.find((term) => term.category === "Payment") as any).content.rules =
			{
				paymentType: "prepayment",
				prepaymentPercentage: 100,
			}
		const shadowContract = buildRuleBasedContractSnapshot({
			ruleSnapshot,
			checkIn: "2030-01-10",
			checkOut: "2030-01-12",
			channel: "web",
		})

		const compared = comparePolicyContractVsRuleContract(policy, shadowContract)
		expect(compared.isConsistent).toBe(false)
		expect(compared.diffs.some((diff) => diff.diffKind === "payment_timing_diff")).toBe(true)
	})

	it("detects cancellation penalty/window mismatches", () => {
		const policy = policyFixture()
		const ruleSnapshot = ruleFixture()
		;(
			ruleSnapshot.contractTerms.find((term) => term.category === "Cancellation") as any
		).content.tiers = [{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 }]
		const shadowContract = buildRuleBasedContractSnapshot({
			ruleSnapshot,
			checkIn: "2030-01-10",
			checkOut: "2030-01-12",
			channel: "web",
		})

		const compared = comparePolicyContractVsRuleContract(policy, shadowContract)
		expect(compared.isConsistent).toBe(false)
		expect(
			compared.diffs.some(
				(diff) => diff.diffKind === "cancellation_window_diff" || diff.diffKind === "penalty_diff"
			)
		).toBe(true)
	})
})
