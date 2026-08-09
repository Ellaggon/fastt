import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resetMetricsForTests } from "@/lib/observability/metrics"
import {
	buildTourRolloutSummary,
	recordTourConfirm,
	recordTourHold,
} from "@/lib/tours/tourObservability"
import {
	getTourRolloutSharedStoreStatus,
	listSharedTourCounters,
	resetTourRolloutSharedStoreForTests,
} from "@/lib/tours/tourRolloutSharedStore"

describe("tours redis multipod readiness (P2 C2)", () => {
	beforeEach(() => {
		resetMetricsForTests()
		resetTourRolloutSharedStoreForTests()
		process.env.TOURS_ROLLOUT_STAGE = "allowlist"
		process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "0"
	})

	afterEach(() => {
		resetMetricsForTests()
		resetTourRolloutSharedStoreForTests()
	})

	it("exposes shared store status and aggregates labeled counters across logical instances", async () => {
		const status = await getTourRolloutSharedStoreStatus()
		expect(status).toMatchObject({
			configured: expect.any(Boolean),
			activeBackend: expect.stringMatching(/^(redis|upstash-rest|memory)$/),
			multipodReady: status.activeBackend !== "memory",
			localCounterKeys: expect.any(Number),
		})

		// Instance A
		recordTourHold("success", undefined, {
			stage: "allowlist",
			cohort: "canary",
			providerId: "prov_a",
		})
		recordTourHold("success", undefined, {
			stage: "allowlist",
			cohort: "canary",
			providerId: "prov_b",
		})
		recordTourConfirm("success", undefined, {
			stage: "allowlist",
			cohort: "canary",
			providerId: "prov_a",
		})

		const holds = listSharedTourCounters("tours_hold_total").reduce((sum, row) => sum + row.value, 0)
		expect(holds).toBe(2)
		const summary = buildTourRolloutSummary({ cohort: "canary" })
		expect(summary.holds.success).toBe(2)
		expect(summary.confirms.success).toBe(1)

		// Live Redis cross-pod sync is covered by `pnpm run ops:tours-redis-multipod`
		// (avoids dual-writing shared Upstash from unit tests).
	})
})
