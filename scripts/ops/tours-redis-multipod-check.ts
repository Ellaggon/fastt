/**
 * C2 — verify Tours rollout counters aggregate across logical pods via Redis.
 *
 * Simulates two process instances:
 *   pod-A increments → Redis INCR (awaited)
 *   pod-B clears local Map → syncSharedTourCountersFromRedis → sees pod-A counts
 *
 * Exit 0 when Redis is active and cross-pod sync works.
 * Exit 2 when Redis is not configured (soft skip for local/CI without Upstash).
 * Exit 1 on hard failure when Redis is configured but sync fails.
 */
import * as persistentCache from "../../src/lib/cache/persistentCache"
import { resetMetricsForTests } from "../../src/lib/observability/metrics"
import {
	buildTourRolloutSummary,
	recordTourConfirm,
	recordTourHold,
} from "../../src/lib/tours/tourObservability"
import {
	flushSharedTourCounterWrites,
	getTourRolloutSharedStoreStatus,
	listSharedTourCounters,
	resetTourRolloutSharedStoreForTests,
	syncSharedTourCountersFromRedis,
} from "../../src/lib/tours/tourRolloutSharedStore"

function sumPrefix(prefix: string): number {
	return listSharedTourCounters(prefix).reduce((sum, row) => sum + row.value, 0)
}

async function main() {
	const status = await getTourRolloutSharedStoreStatus()
	const requireRedis = process.env.TOURS_REDIS_CHECK_REQUIRE === "true"

	if (!status.multipodReady) {
		const msg = `tours_redis_multipod_skip configured=${status.configured} backend=${status.activeBackend}`
		if (requireRedis) {
			console.error(msg)
			process.exitCode = 1
			return
		}
		console.log(msg)
		process.exitCode = 2
		return
	}

	const probe = await persistentCache.verifyRuntimeConnection()
	if (!probe.ok) throw new Error(`redis_probe_failed backend=${probe.backend}`)

	const prefix = `tours_mp_${Date.now().toString(36)}`
	process.env.TOURS_ROLLOUT_STAGE = "allowlist"
	process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "0"

	// --- pod A ---
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
	const ctx = { stage: "allowlist" as const, cohort: "canary" as const, providerId: prefix }
	for (let i = 0; i < 7; i++) recordTourHold("success", undefined, ctx)
	for (let i = 0; i < 5; i++) recordTourConfirm("success", undefined, ctx)

	const podALocal = buildTourRolloutSummary({ cohort: "canary" })
	if (podALocal.holds.success < 7 || podALocal.confirms.success < 5) {
		throw new Error("pod_a_seed_failed")
	}
	await flushSharedTourCounterWrites()

	const podAHoldKeys = listSharedTourCounters("tours_hold_total").map((row) => row.key)
	if (!podAHoldKeys.length) throw new Error("pod_a_missing_shared_keys")

	// --- pod B (new process Map) ---
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
	if (sumPrefix("tours_hold_total") !== 0) throw new Error("pod_b_local_not_empty")

	const syncB = await syncSharedTourCountersFromRedis()
	const afterHold = sumPrefix("tours_hold_total")
	const afterConfirm = sumPrefix("tours_confirm_total")
	const recovered = listSharedTourCounters("tours_hold_total").some((row) =>
		podAHoldKeys.includes(row.key)
	)

	if (syncB.keys === 0) {
		throw new Error(
			"redis_list_keys_empty after INCR — Upstash SCAN/listKeysByPrefix may be unavailable; multipod sync cannot hydrate"
		)
	}
	if (afterHold < 7 || afterConfirm < 5 || !recovered) {
		throw new Error(
			`cross_pod_sync_failed holds=${afterHold} confirms=${afterConfirm} recovered=${recovered} keys=${syncB.keys}`
		)
	}

	const summaryB = buildTourRolloutSummary({ cohort: "canary" })
	console.log(
		[
			"tours_redis_multipod_ok",
			`backend=${status.activeBackend}`,
			`holds=${summaryB.holds.success}`,
			`confirms=${summaryB.confirms.success}`,
			`keys=${syncB.keys}`,
			`recovered=${recovered}`,
		].join(" ")
	)
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
