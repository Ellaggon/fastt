import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { buildRefundQuote } from "@/modules/financial/public"
import {
	buildPolicyCalculationSnapshot,
	buildPolicySnapshot,
	localDeadlineFromHours,
	type ResolveEffectivePoliciesResult,
} from "@/modules/policies/public"
import { zonedLocalDateTimeToUtcMs } from "@/shared/domain/date/zoned-datetime"

function cancellationPolicy(tiers: Array<Record<string, unknown>>): ResolveEffectivePoliciesResult {
	return {
		version: "v2",
		policies: [
			{
				category: "Cancellation",
				resolvedFromScope: "rate_plan",
				policy: {
					id: "pol_cancel_hours",
					groupId: "grp_cancel_hours",
					description: "Tour hours cancellation",
					version: 1,
					status: "active",
					policyPresetKey: null,
					stayLengthType: "any",
					gracePeriod: null,
					refundBasis: "gross_amount",
					payoutBasis: "host_payout",
					localTimezone: "America/La_Paz",
					rules: [],
					cancellationTiers: tiers.map((tier, index) => ({
						id: `tier_${index}`,
						policyId: "pol_cancel_hours",
						daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
						hoursBeforeDeparture:
							tier.hoursBeforeDeparture == null ? null : Number(tier.hoursBeforeDeparture),
						penaltyType: String(tier.penaltyType ?? "percentage"),
						penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
					})),
				},
			},
		],
		missingCategories: [],
		coverage: { hasFullCoverage: true },
		asOfDate: "2026-09-15",
		warnings: [],
	}
}

function quoteFromSnapshot(params: {
	snapshot: ReturnType<typeof buildPolicySnapshot>
	cancelledAt: Date
}) {
	return buildRefundQuote({
		bookingId: "11111111-1111-4111-8111-111111111111",
		providerId: "prov_test",
		reason: "guest_cancel",
		currency: "USD",
		grossAmount: 100,
		cancelledAt: params.cancelledAt,
		bookedAt: new Date("2026-09-01T12:00:00.000Z"),
		policySnapshot: params.snapshot,
	})
}

describe("cancellation hours → refund quote (P0 1.2)", () => {
	const previousRefundHoursFlag = process.env.TOURS_REFUND_HOURS_ENABLED

	const previousStage = process.env.TOURS_ROLLOUT_STAGE

	beforeEach(() => {
		process.env.TOURS_REFUND_HOURS_ENABLED = "true"
		process.env.TOURS_ROLLOUT_STAGE = "general"
	})

	afterEach(() => {
		if (previousRefundHoursFlag === undefined) delete process.env.TOURS_REFUND_HOURS_ENABLED
		else process.env.TOURS_REFUND_HOURS_ENABLED = previousRefundHoursFlag
		if (previousStage === undefined) delete process.env.TOURS_ROLLOUT_STAGE
		else process.env.TOURS_ROLLOUT_STAGE = previousStage
	})

	it("computes hour deadlines as zoned wall clock from departureTime", () => {
		// 12:00 America/La_Paz = 16:00Z; −6h → 10:00Z = 06:00 local
		expect(
			localDeadlineFromHours({
				checkInDate: "2026-09-15",
				departureTime: "12:00",
				hoursBeforeDeparture: 6,
				timezone: "America/La_Paz",
			})
		).toBe("2026-09-15T06:00:00[America/La_Paz]")

		expect(zonedLocalDateTimeToUtcMs("2026-09-15T06:00:00[America/La_Paz]")).toBe(
			Date.parse("2026-09-15T10:00:00.000Z")
		)

		// 01:00 local − 6h crosses into previous local day
		expect(
			localDeadlineFromHours({
				checkInDate: "2026-09-15",
				departureTime: "01:00",
				hoursBeforeDeparture: 6,
				timezone: "America/La_Paz",
			})
		).toBe("2026-09-14T19:00:00[America/La_Paz]")

		expect(zonedLocalDateTimeToUtcMs("2026-09-14T19:00:00[America/La_Paz]")).toBe(
			Date.parse("2026-09-14T23:00:00.000Z")
		)
	})

	it("keeps preview / hold snapshot / refund quote aligned for hour policy", () => {
		const resolved = cancellationPolicy([
			{
				daysBeforeArrival: 1,
				hoursBeforeDeparture: 6,
				penaltyType: "percentage",
				penaltyAmount: 0,
			},
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		])
		const snapshot = buildPolicySnapshot({
			resolvedPolicies: resolved,
			checkIn: "2026-09-15",
			checkOut: "2026-09-16",
			departureTime: "12:00",
			channel: "web",
		})
		const freeDeadline =
			snapshot.cancellation?.calculation?.cancellation?.freeCancellationDeadlineLocal
		expect(freeDeadline).toBe("2026-09-15T06:00:00[America/La_Paz]")
		expect(snapshot.cancellation?.calculation?.cancellation?.refundTiers[0]).toMatchObject({
			hoursBeforeDeparture: 6,
			deadlineLocal: freeDeadline,
			refundPercent: 100,
		})

		const calc = buildPolicyCalculationSnapshot({
			category: "cancellation",
			policy: resolved.policies[0].policy,
			checkIn: "2026-09-15",
			checkOut: "2026-09-16",
			departureTime: "12:00",
		})
		expect(calc.calculation.cancellation?.freeCancellationDeadlineLocal).toBe(freeDeadline)

		// Cutoff instant is 10:00Z (= 06:00 America/La_Paz), not 06:00Z.
		const atCutoff = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-15T10:00:00.000Z"),
		})
		expect(atCutoff.refundPercent).toBe(100)

		const afterCutoff = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-15T10:00:01.000Z"),
		})
		expect(afterCutoff.refundPercent).toBe(0)

		const wellBefore = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-15T09:00:00.000Z"),
		})
		expect(wellBefore.refundPercent).toBe(100)

		// Regression: treating local 06:00 as UTC would wrongly deny refund here.
		const falseUtcCutoff = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-15T06:00:01.000Z"),
		})
		expect(falseUtcCutoff.refundPercent).toBe(100)
	})

	it("falls back to daysBeforeArrival midnight deadline when hours are absent", () => {
		const resolved = cancellationPolicy([
			{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		])
		const snapshot = buildPolicySnapshot({
			resolvedPolicies: resolved,
			checkIn: "2026-09-15",
			checkOut: "2026-09-16",
			departureTime: "12:00",
			channel: "web",
		})
		expect(snapshot.cancellation?.calculation?.cancellation?.freeCancellationDeadlineLocal).toBe(
			"2026-09-14T00:00:00[America/La_Paz]"
		)
		// Midnight America/La_Paz = 04:00Z
		expect(zonedLocalDateTimeToUtcMs("2026-09-14T00:00:00[America/La_Paz]")).toBe(
			Date.parse("2026-09-14T04:00:00.000Z")
		)

		const beforeMidnight = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-14T03:59:59.000Z"),
		})
		expect(beforeMidnight.refundPercent).toBe(100)
		const afterMidnight = quoteFromSnapshot({
			snapshot,
			cancelledAt: new Date("2026-09-14T04:00:01.000Z"),
		})
		expect(afterMidnight.refundPercent).toBe(0)
	})
})
