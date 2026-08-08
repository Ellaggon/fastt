import { describe, expect, it, beforeEach, afterEach } from "vitest"

import { resetMetricsForTests } from "@/lib/observability/metrics"
import {
	buildTourRolloutCohortComparison,
	buildTourRolloutSummary,
	evaluateTourRolloutHealth,
	providerSafeLabel,
	recordTourConfirm,
	recordTourHold,
	recordTourRefund,
	recordTourRefundQuote,
	recordTourSearch,
	recordTourVoucher,
} from "@/lib/tours/tourObservability"
import { resetTourRolloutSharedStoreForTests } from "@/lib/tours/tourRolloutSharedStore"
import { GET as toursRolloutGet } from "@/pages/api/internal/observability/tours-rollout"

function recordAsInstance(outcome: "success" | "failure", providerId: string) {
	recordTourHold(outcome, outcome === "failure" ? "boom" : undefined, {
		stage: "allowlist",
		cohort: "canary",
		providerId,
	})
}

const previousToken = process.env.FASTT_INFRA_HEALTH_TOKEN
const previousStage = process.env.TOURS_ROLLOUT_STAGE
const previousDwell = process.env.TOURS_ROLLOUT_MIN_DWELL_MS
const previousEntered = process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT

beforeEach(() => {
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
	delete process.env.FASTT_INFRA_HEALTH_TOKEN
	process.env.TOURS_ROLLOUT_STAGE = "allowlist"
	process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "0"
	process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT = String(Date.now() - 60_000)
})

afterEach(() => {
	if (previousToken === undefined) delete process.env.FASTT_INFRA_HEALTH_TOKEN
	else process.env.FASTT_INFRA_HEALTH_TOKEN = previousToken
	if (previousStage === undefined) delete process.env.TOURS_ROLLOUT_STAGE
	else process.env.TOURS_ROLLOUT_STAGE = previousStage
	if (previousDwell === undefined) delete process.env.TOURS_ROLLOUT_MIN_DWELL_MS
	else process.env.TOURS_ROLLOUT_MIN_DWELL_MS = previousDwell
	if (previousEntered === undefined) delete process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT
	else process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT = previousEntered
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
})

describe("tour rollout observability", () => {
	it("computes hold→confirm, redeem/issued, refund quote vs applied ratios", () => {
		for (let i = 0; i < 10; i++) recordTourHold("success")
		for (let i = 0; i < 3; i++) recordTourHold("not_holdable", "NO_CAPACITY")
		for (let i = 0; i < 7; i++) recordTourConfirm("success")
		for (let i = 0; i < 2; i++) recordTourConfirm("failure", "HOLD_EXPIRED")
		for (let i = 0; i < 7; i++) recordTourVoucher("issued")
		for (let i = 0; i < 3; i++) recordTourVoucher("redeemed")
		for (let i = 0; i < 4; i++) recordTourRefundQuote("success", "guest_cancelled")
		for (let i = 0; i < 1; i++) recordTourRefundQuote("manual_review", "needs_review")
		for (let i = 0; i < 3; i++) recordTourRefund("success", "guest_cancelled")

		const summary = buildTourRolloutSummary({ cohort: "all" })
		expect(summary.ratios.holdToConfirm).toBeCloseTo(0.7, 5)
		expect(summary.ratios.redeemIssued).toBeCloseTo(3 / 7, 5)
		expect(summary.ratios.refundQuoteApplied).toBeCloseTo(3 / 5, 5)
		expect(summary.holds.failuresByReason[0]?.reason).toBe("no_capacity")
		expect(summary.confirms.failuresByReason.some((row) => row.reason === "hold_expired")).toBe(
			true
		)
	})

	it("aggregates labeled counters across two logical instances via shared store", () => {
		// Instance A
		recordAsInstance("success", "prov_a")
		recordAsInstance("success", "prov_a")
		// Instance B (same shared Map / Redis keyspace)
		recordAsInstance("success", "prov_b")
		const summary = buildTourRolloutSummary({ cohort: "canary" })
		expect(summary.holds.success).toBe(3)
		expect(providerSafeLabel("prov_a")).toHaveLength(12)
		expect(providerSafeLabel("prov_a")).not.toBe("prov_a")
	})

	it("exposes cohort comparison for canary vs control", () => {
		recordTourHold("success", undefined, { stage: "percentage", cohort: "canary", providerId: "p1" })
		recordTourConfirm("success", undefined, {
			stage: "percentage",
			cohort: "canary",
			providerId: "p1",
		})
		recordTourHold("success", undefined, {
			stage: "percentage",
			cohort: "control",
			providerId: "p2",
		})
		const comparison = buildTourRolloutCohortComparison()
		expect(comparison.canary.holds.success).toBe(1)
		expect(comparison.control.holds.success).toBe(1)
		expect(comparison.all.holds.success).toBe(2)
	})

	it("fires baseline alerts when ratios drop below thresholds with enough sample", () => {
		for (let i = 0; i < 20; i++) recordTourHold("success")
		for (let i = 0; i < 4; i++) recordTourConfirm("success")
		for (let i = 0; i < 10; i++) recordTourHold("not_holdable", "SOLD_OUT")
		for (let i = 0; i < 20; i++) recordTourVoucher("issued")
		for (let i = 0; i < 1; i++) recordTourVoucher("redeemed")
		for (let i = 0; i < 8; i++) recordTourRefundQuote("success", "guest_cancelled")
		for (let i = 0; i < 1; i++) recordTourRefund("success", "guest_cancelled")
		recordTourSearch("error")

		const health = evaluateTourRolloutHealth({
			summary: buildTourRolloutSummary({ cohort: "all" }),
			thresholds: {
				minSampleSize: 10,
				minHoldToConfirmRate: 0.5,
				maxHoldFailureRate: 0.2,
				minRedeemIssuedRate: 0.25,
				maxRefundQuoteNotAppliedRate: 0.3,
			},
		})
		expect(health.status).toBe("degraded")
		expect(health.isHealthy).toBe(false)
		expect(health.alerts.map((a) => a.code)).toEqual(
			expect.arrayContaining([
				"tours_hold_confirm_below_baseline",
				"tours_hold_failure_rate_high",
				"tours_redeem_issued_below_baseline",
				"tours_refund_quote_vs_applied_gap",
				"tours_search_errors",
			])
		)
	})

	it("marks insufficient_sample as not healthy (blocks expand)", () => {
		recordTourHold("success")
		recordTourConfirm("failure", "boom")
		const health = evaluateTourRolloutHealth({
			summary: buildTourRolloutSummary({ cohort: "all" }),
			thresholds: { minSampleSize: 20 },
		})
		expect(health.status).toBe("insufficient_sample")
		expect(health.isHealthy).toBe(false)
		expect(health.alerts).toHaveLength(0)
	})

	it("requires bearer token on tours-rollout endpoint in production-like token mode", async () => {
		process.env.FASTT_INFRA_HEALTH_TOKEN = "secret-token"
		const denied = await toursRolloutGet({
			request: new Request(
				"http://localhost/api/internal/observability/tours-rollout?min_sample_size=10"
			),
		} as never)
		expect(denied.status).toBe(401)

		for (let i = 0; i < 20; i++) {
			recordTourHold("success")
			recordTourConfirm("success")
			recordTourVoucher("issued")
			recordTourVoucher("redeemed")
		}
		const response = await toursRolloutGet({
			request: new Request(
				"http://localhost/api/internal/observability/tours-rollout?min_sample_size=10",
				{ headers: { Authorization: "Bearer secret-token" } }
			),
		} as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.ok).toBe(true)
		expect(payload.cohorts.canary).toBeTruthy()
		expect(payload.canary.expansion.dwell).toBeTruthy()
		expect(payload.alertRulesPath).toContain("tours-rollout.rules.yml")
		expect(payload.recommendedAlerts.length).toBeGreaterThan(0)
	})
})
