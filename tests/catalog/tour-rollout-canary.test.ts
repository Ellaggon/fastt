import { afterEach, describe, expect, it } from "vitest"

import { resetMetricsForTests } from "@/lib/observability/metrics"
import {
	evaluateTourCanary,
	getTourRolloutStage,
	parseTourRolloutStage,
	tourCanaryBucket,
} from "@/lib/tours/tourRolloutCanary"
import {
	evaluateTourRolloutExpansionGate,
	filterTourSearchCardsForCanary,
	recordTourConfirm,
	recordTourHold,
	resolveTourHoursBeforeDeparture,
	toursCheckoutEnabled,
	toursPublicSearchEnabled,
	toursRefundHoursEnabled,
} from "@/lib/tours/tourObservability"
import { resetTourRolloutSharedStoreForTests } from "@/lib/tours/tourRolloutSharedStore"
import { buildPolicyCalculationSnapshot } from "@/modules/policies/public"

const CANARY_ENV_KEYS = [
	"TOURS_CHECKOUT_ENABLED",
	"TOURS_PUBLIC_SEARCH_ENABLED",
	"TOURS_REFUND_HOURS_ENABLED",
	"TOURS_ROLLOUT_STAGE",
	"TOURS_PROVIDER_ALLOWLIST",
	"TOURS_ROLLOUT_PERCENT",
	"TOURS_ROLLOUT_STAGING_HOSTS",
	"TOURS_ROLLOUT_DEPLOYMENT_ENV",
	"TOURS_ROLLOUT_MIN_DWELL_MS",
	"TOURS_ROLLOUT_STAGE_ENTERED_AT",
	"TOURS_ROLLOUT_MIN_SAMPLE_SIZE",
] as const

const previous = new Map<string, string | undefined>()

function snapshotEnv(): void {
	for (const key of CANARY_ENV_KEYS) {
		previous.set(key, process.env[key])
		delete process.env[key]
	}
}

function restoreEnv(): void {
	for (const key of CANARY_ENV_KEYS) {
		const value = previous.get(key)
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
	previous.clear()
}

afterEach(() => {
	restoreEnv()
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
})

describe("tour rollout canary (release)", () => {
	it("fail-closes stage when unset or invalid", () => {
		snapshotEnv()
		expect(parseTourRolloutStage(undefined)).toBe("off")
		expect(parseTourRolloutStage("typo")).toBe("off")
		expect(
			toursCheckoutEnabled({
				env: { TOURS_CHECKOUT_ENABLED: "true" },
				providerId: "prov_any",
			})
		).toBe(false)
		expect(getTourRolloutStage({ env: { TOURS_CHECKOUT_ENABLED: "true" } })).toBe("off")
	})

	it("staging stage only enables on staging deployment/host", () => {
		snapshotEnv()
		const env = {
			TOURS_CHECKOUT_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "staging",
			TOURS_ROLLOUT_STAGING_HOSTS: "staging.fastt.test",
		}
		expect(
			toursCheckoutEnabled({
				env,
				providerId: "prov_1",
				deploymentEnv: "production",
				host: "app.fastt.test",
			})
		).toBe(false)
		expect(
			toursCheckoutEnabled({
				env,
				providerId: "prov_1",
				deploymentEnv: "preview",
				host: "app.fastt.test",
			})
		).toBe(true)
		expect(
			toursCheckoutEnabled({
				env,
				providerId: "prov_1",
				deploymentEnv: "production",
				host: "staging.fastt.test",
			})
		).toBe(true)
	})

	it("allowlist gates checkout and filters search cards to allowlisted providers", () => {
		snapshotEnv()
		const env = {
			TOURS_CHECKOUT_ENABLED: "true",
			TOURS_PUBLIC_SEARCH_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "allowlist",
			TOURS_PROVIDER_ALLOWLIST: "prov_a,prov_b",
		}
		expect(toursCheckoutEnabled({ env, providerId: "prov_a" })).toBe(true)
		expect(toursCheckoutEnabled({ env, providerId: "prov_z" })).toBe(false)
		expect(toursCheckoutEnabled({ env })).toBe(false)
		// Discovery stays on, but cards are filtered.
		expect(toursPublicSearchEnabled({ env, subjectId: "sess_1" })).toBe(true)
		const filtered = filterTourSearchCardsForCanary(
			[
				{ providerId: "prov_a", productId: "p1" },
				{ providerId: "prov_z", productId: "p2" },
			],
			{ env }
		)
		expect(filtered.map((c) => c.productId)).toEqual(["p1"])
	})

	it("percentage stage uses stable session/provider bucket and always includes allowlist", () => {
		snapshotEnv()
		const env = {
			TOURS_CHECKOUT_ENABLED: "true",
			TOURS_PUBLIC_SEARCH_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "percentage",
			TOURS_PROVIDER_ALLOWLIST: "prov_force",
			TOURS_ROLLOUT_PERCENT: "0",
		}
		expect(toursCheckoutEnabled({ env, providerId: "prov_force" })).toBe(true)
		expect(toursCheckoutEnabled({ env, providerId: "prov_other" })).toBe(false)
		expect(toursPublicSearchEnabled({ env, subjectId: "sess_out" })).toBe(false)

		const bucket = tourCanaryBucket("provider:prov_bucket")
		expect(bucket).toBeGreaterThanOrEqual(0)
		expect(bucket).toBeLessThan(100)
		expect(
			evaluateTourCanary({
				killSwitchEnabled: true,
				subject: {
					env: { ...env, TOURS_ROLLOUT_PERCENT: "100" },
					providerId: "prov_bucket",
				},
			}).enabled
		).toBe(true)
		expect(
			toursPublicSearchEnabled({
				env: { ...env, TOURS_ROLLOUT_PERCENT: "100" },
				subjectId: "sess_in",
			})
		).toBe(true)
	})

	it("threads provider into refund-hours canary for policy snapshots", () => {
		snapshotEnv()
		const env = {
			TOURS_REFUND_HOURS_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "allowlist",
			TOURS_PROVIDER_ALLOWLIST: "prov_in",
		}
		process.env.TOURS_REFUND_HOURS_ENABLED = "true"
		process.env.TOURS_ROLLOUT_STAGE = "allowlist"
		process.env.TOURS_PROVIDER_ALLOWLIST = "prov_in"

		expect(toursRefundHoursEnabled({ env, providerId: "prov_in" })).toBe(true)
		expect(toursRefundHoursEnabled({ env, providerId: "prov_out" })).toBe(false)
		expect(resolveTourHoursBeforeDeparture(6, { env, providerId: "prov_out" })).toBeNull()
		expect(resolveTourHoursBeforeDeparture(6, { env, providerId: "prov_in" })).toBe(6)

		const policy = {
			id: "pol",
			groupId: "grp",
			description: "hours",
			version: 1,
			status: "active",
			policyPresetKey: null,
			stayLengthType: "any",
			gracePeriod: null,
			refundBasis: "gross_amount",
			payoutBasis: "host_payout",
			localTimezone: "America/La_Paz",
			rules: [],
			cancellationTiers: [
				{
					id: "t1",
					policyId: "pol",
					daysBeforeArrival: 1,
					hoursBeforeDeparture: 6,
					penaltyType: "percentage",
					penaltyAmount: 0,
				},
			],
		}
		const outside = buildPolicyCalculationSnapshot({
			category: "cancellation",
			policy: policy as never,
			checkIn: "2026-09-15",
			departureTime: "12:00",
			providerId: "prov_out",
		})
		expect(outside.calculation.cancellation?.refundTiers[0]?.hoursBeforeDeparture).toBeNull()

		const inside = buildPolicyCalculationSnapshot({
			category: "cancellation",
			policy: policy as never,
			checkIn: "2026-09-15",
			departureTime: "12:00",
			providerId: "prov_in",
		})
		expect(inside.calculation.cancellation?.refundTiers[0]?.hoursBeforeDeparture).toBe(6)
	})

	it("covers stage matrix for expected enablement (off/staging/allowlist/%/general)", () => {
		snapshotEnv()
		const base = { TOURS_CHECKOUT_ENABLED: "true", TOURS_PROVIDER_ALLOWLIST: "prov_a" }
		expect(toursCheckoutEnabled({ env: { ...base, TOURS_ROLLOUT_STAGE: "off" }, providerId: "prov_a" })).toBe(
			false
		)
		expect(
			toursCheckoutEnabled({
				env: { ...base, TOURS_ROLLOUT_STAGE: "staging" },
				providerId: "prov_a",
				deploymentEnv: "production",
				host: "prod.example",
			})
		).toBe(false)
		expect(
			toursCheckoutEnabled({
				env: { ...base, TOURS_ROLLOUT_STAGE: "allowlist" },
				providerId: "prov_a",
			})
		).toBe(true)
		expect(
			toursCheckoutEnabled({
				env: { ...base, TOURS_ROLLOUT_STAGE: "percentage", TOURS_ROLLOUT_PERCENT: "0" },
				providerId: "prov_b",
			})
		).toBe(false)
		expect(
			toursCheckoutEnabled({
				env: { ...base, TOURS_ROLLOUT_STAGE: "general" },
				providerId: "prov_b",
			})
		).toBe(true)
	})

	it("blocks expansion on insufficient sample, dwell, or hold→confirm regression", () => {
		snapshotEnv()
		process.env.TOURS_ROLLOUT_STAGE = "allowlist"
		process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "999999999"
		process.env.TOURS_ROLLOUT_MIN_SAMPLE_SIZE = "20"

		const insufficient = evaluateTourRolloutExpansionGate({
			subject: { env: process.env as Record<string, string | undefined> },
		})
		expect(insufficient.expand).toBe(false)
		expect(insufficient.blockers.some((b) => b.includes("sample"))).toBe(true)

		for (let i = 0; i < 20; i++) recordTourHold("success")
		for (let i = 0; i < 2; i++) recordTourConfirm("success")
		const degraded = evaluateTourRolloutExpansionGate({
			subject: { env: process.env as Record<string, string | undefined> },
		})
		expect(degraded.expand).toBe(false)
		expect(degraded.blockers.length).toBeGreaterThan(0)

		process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "0"
		process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT = String(Date.now() - 1000)
		resetMetricsForTests()
		resetTourRolloutSharedStoreForTests()
		for (let i = 0; i < 20; i++) {
			recordTourHold("success")
			recordTourConfirm("success")
		}
		const ready = evaluateTourRolloutExpansionGate({
			subject: { env: process.env as Record<string, string | undefined> },
			nowMs: Date.now(),
		})
		expect(ready.expand).toBe(true)
		expect(ready.dwell.ready).toBe(true)
	})
})
