import type { APIRoute } from "astro"

import {
	isInternalObservabilityAuthorized,
	unauthorizedObservabilityResponse,
} from "@/lib/observability/internalObservabilityAuth"
import {
	buildTourRolloutCohortComparison,
	evaluateTourRolloutExpansionGateAsync,
	getTourRolloutThresholds,
	type TourRolloutThresholds,
} from "@/lib/tours/tourObservability"
import {
	getTourProviderAllowlist,
	getTourRolloutPercent,
	getTourRolloutStage,
} from "@/lib/tours/tourRolloutCanary"
import {
	getTourRolloutSharedStoreStatus,
	syncSharedTourCountersFromRedis,
} from "@/lib/tours/tourRolloutSharedStore"

function parseNumber(value: string | null, fallback: number): number {
	if (value == null || String(value).trim().length === 0) return fallback
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

function thresholdsFromRequest(url: URL): Partial<TourRolloutThresholds> {
	const defaults = getTourRolloutThresholds()
	return {
		minHoldToConfirmRate: parseNumber(
			url.searchParams.get("min_hold_confirm_rate"),
			defaults.minHoldToConfirmRate
		),
		maxHoldFailureRate: parseNumber(
			url.searchParams.get("max_hold_failure_rate"),
			defaults.maxHoldFailureRate
		),
		minRedeemIssuedRate: parseNumber(
			url.searchParams.get("min_redeem_issued_rate"),
			defaults.minRedeemIssuedRate
		),
		maxRefundQuoteNotAppliedRate: parseNumber(
			url.searchParams.get("max_refund_quote_gap_rate"),
			defaults.maxRefundQuoteNotAppliedRate
		),
		minSampleSize: Math.max(
			1,
			Math.floor(parseNumber(url.searchParams.get("min_sample_size"), defaults.minSampleSize))
		),
	}
}

/**
 * Tours rollout health for dashboards/alerts.
 * Requires FASTT_INFRA_HEALTH_TOKEN bearer (or non-production when unset).
 */
export const GET: APIRoute = async ({ request }) => {
	if (!isInternalObservabilityAuthorized(request)) {
		return unauthorizedObservabilityResponse()
	}

	const url = new URL(request.url)
	const thresholds = thresholdsFromRequest(url)
	await syncSharedTourCountersFromRedis()
	const expansion = await evaluateTourRolloutExpansionGateAsync({ thresholds })
	const health = expansion.health
	const cohorts = buildTourRolloutCohortComparison()
	const stage = getTourRolloutStage()
	const sharedStore = await getTourRolloutSharedStoreStatus()
	return new Response(
		JSON.stringify({
			ok: true,
			status: health.status,
			canary: {
				stage,
				providerAllowlistCount: getTourProviderAllowlist().size,
				rolloutPercent: getTourRolloutPercent(),
				expansion: {
					expand: expansion.expand,
					blockers: expansion.blockers,
					dwell: expansion.dwell,
				},
			},
			sharedStore,
			cohorts: {
				canary: {
					ratios: cohorts.canary.ratios,
					holds: cohorts.canary.holds.total,
					confirms: cohorts.canary.confirms.total,
				},
				control: {
					ratios: cohorts.control.ratios,
					holds: cohorts.control.holds.total,
					confirms: cohorts.control.confirms.total,
				},
				all: {
					ratios: cohorts.all.ratios,
					holds: cohorts.all.holds.total,
					confirms: cohorts.all.confirms.total,
				},
			},
			health: {
				isHealthy: health.isHealthy,
				reasons: health.reasons,
				thresholds: health.thresholds,
				alerts: health.alerts,
			},
			ratios: health.summary.ratios,
			counters: {
				holds: health.summary.holds,
				confirms: health.summary.confirms,
				vouchers: health.summary.vouchers,
				refunds: health.summary.refunds,
				search: health.summary.search,
			},
			window: health.summary.window,
			recommendedAlerts: [
				'tours_rollout_hold_to_confirm_ratio{cohort="canary"} < baseline (sample ≥ minSampleSize)',
				'tours_rollout_hold_failure_ratio{cohort="canary"} > TOURS_ROLLOUT_MAX_HOLD_FAILURE_RATE',
				'tours_rollout_redeem_issued_ratio{cohort="canary"} < baseline',
				'1 - tours_rollout_refund_quote_applied_ratio{cohort="canary"} > TOURS_ROLLOUT_MAX_REFUND_QUOTE_GAP_RATE',
				"tours_rollout_alert_firing > 0 for 15m",
			],
			alertRulesPath: "docs/ops/tours-rollout.rules.yml",
			prometheusScrapePath: "docs/ops/prometheus/prometheus.tours.scrape.yml",
			alertmanagerPath: "docs/ops/prometheus/alertmanager.tours.receivers.yml",
			releaseSequence: ["staging", "allowlist", "percentage", "general"],
		}),
		{
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		}
	)
}
