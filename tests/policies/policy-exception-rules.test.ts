import { describe, expect, it } from "vitest"

import {
	buildPolicySnapshot,
	resolvePolicyExceptionOverrides,
	type PolicyExceptionRule,
} from "@/modules/policies/public"

function resolvedPolicy(category: string, policy: Record<string, unknown>) {
	return {
		category,
		resolvedFromScope: "global",
		policy: {
			id: `pol_${category}`,
			groupId: `grp_${category}`,
			description: `${category} policy`,
			version: 1,
			status: "active",
			policyPresetKey: null,
			stayLengthType: null,
			gracePeriod: null,
			refundBasis: "nightly_rate",
			payoutBasis: "host_payout",
			localTimezone: "America/Santiago",
			effectiveFrom: null,
			effectiveTo: null,
			rules: [],
			cancellationTiers: [],
			...policy,
		},
	}
}

describe("policies/policy exception rules", () => {
	it("resolves platform/legal cancellation overrides before final refund calculation", () => {
		const exceptionRules: PolicyExceptionRule[] = [
			{
				id: "per_mde_1",
				type: "major_disruptive_event",
				scope: "global",
				category: "Cancellation",
				priority: 1,
				isActive: true,
				reason: "Weather emergency",
				action: {
					refundOverridePercent: 100,
					forceRefundBasis: "total_booking_amount",
				},
			},
		]

		const snapshot = buildPolicySnapshot({
			checkIn: "2030-02-10",
			checkOut: "2030-02-12",
			resolvedPolicies: {
				policies: [
					resolvedPolicy("Cancellation", {
						cancellationTiers: [
							{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 100 },
						],
					}),
				],
			} as any,
			exceptionRules,
		})

		expect(snapshot.cancellation?.calculation?.override).toEqual(
			expect.objectContaining({
				applied: true,
				ruleId: "per_mde_1",
				type: "major_disruptive_event",
			})
		)
		expect(snapshot.cancellation?.appliedOverrides).toHaveLength(1)
		expect(snapshot.cancellation?.calculation?.cancellation?.refundTiers[0]).toEqual(
			expect.objectContaining({
				penaltyAmount: 0,
				refundPercent: 100,
				refundBasis: "total_booking_amount",
			})
		)
	})

	it("can waive no-show charges through a support/legal exception", () => {
		const snapshot = buildPolicySnapshot({
			checkIn: "2030-02-10",
			checkOut: "2030-02-12",
			resolvedPolicies: {
				policies: [
					resolvedPolicy("NoShow", {
						rules: [
							{ ruleKey: "penaltyType", ruleValue: "first_night" },
							{ ruleKey: "penaltyAmount", ruleValue: 100 },
						],
					}),
				],
			} as any,
			exceptionRules: [
				{
					id: "per_support_1",
					type: "support_manual_override",
					scope: "global",
					category: "NoShow",
					priority: 1,
					isActive: true,
					reason: "Support approved waiver",
					action: { waiveNoShowCharge: true },
				},
			],
		})

		expect(snapshot.no_show?.calculation?.noShow).toEqual(
			expect.objectContaining({
				chargeType: "waived",
				chargeAmount: 0,
			})
		)
		expect(snapshot.no_show?.calculation?.override.ruleId).toBe("per_support_1")
	})

	it("filters exceptions by category, scope, active status, and effective dates", () => {
		const resolved = resolvePolicyExceptionOverrides(
			[
				{
					id: "inactive",
					type: "local_law",
					category: "Cancellation",
					isActive: false,
					action: { refundOverridePercent: 100 },
				},
				{
					id: "future",
					type: "local_law",
					category: "Cancellation",
					isActive: true,
					effectiveFrom: "2031-01-01",
					action: { refundOverridePercent: 100 },
				},
				{
					id: "match",
					type: "local_law",
					scope: "product",
					scopeId: "prod_1",
					category: "Cancellation",
					priority: 5,
					isActive: true,
					effectiveFrom: "2029-01-01",
					effectiveTo: "2030-12-31",
					action: { refundOverridePercent: 50 },
				},
			],
			{
				category: "Cancellation",
				scope: "product",
				scopeId: "prod_1",
				asOfDate: "2030-02-10",
			}
		)

		expect(resolved.map((rule) => rule.id)).toEqual(["match"])
	})

	it("accepts repository-prefiltered scoped exceptions when snapshot context has no scope", () => {
		const resolved = resolvePolicyExceptionOverrides(
			[
				{
					id: "rate_plan_override",
					type: "major_disruptive_event",
					scope: "rate_plan",
					scopeId: "rp_1",
					category: "Cancellation",
					priority: 1,
					isActive: true,
					action: { refundOverridePercent: 100 },
				},
			],
			{
				category: "Cancellation",
				asOfDate: "2030-02-10",
			}
		)

		expect(resolved.map((rule) => rule.id)).toEqual(["rate_plan_override"])
	})
})
