import type { APIRoute } from "astro"

import {
	getFeatureFlag,
	getSearchHealthThresholds,
	type FeatureFlagContext,
} from "@/config/featureFlags"
import { getMetricsWindow, readCounter, readTimingQuantile } from "@/lib/observability/metrics"
import { buildSearchShadowSummary } from "@/lib/observability/search-shadow-summary"
import { evaluateSearchEngineHealth } from "@/modules/search/public"

type SearchEngineStatus = "healthy" | "degraded"

type SearchOperationalThresholds = {
	maxErrorRate: number
	maxAnomalousEmptyRate: number
	maxMissingDataRate: number
	maxP95LatencyMs: number
}

function pct(part: number, total: number): number {
	if (total <= 0) return 0
	return Number(((part / total) * 100).toFixed(4))
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (value == null || String(value).trim().length === 0) return fallback
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

function readThresholds(context: FeatureFlagContext): SearchOperationalThresholds {
	const request = context.request
	const get = (queryKey: string, headerKey: string, envKey: string, fallback: number) => {
		const queryValue = request
			? (new URL(request.url).searchParams.get(queryKey) ?? undefined)
			: undefined
		const headerValue = request?.headers.get(headerKey) ?? undefined
		return parseNumber(queryValue ?? headerValue ?? process.env[envKey], fallback)
	}
	return {
		maxErrorRate: get(
			"search_view_error_threshold_pct",
			"x-search-view-error-threshold-pct",
			"SEARCH_VIEW_ERROR_THRESHOLD_PCT",
			1
		),
		maxAnomalousEmptyRate: get(
			"search_view_anomalous_empty_threshold_pct",
			"x-search-view-anomalous-empty-threshold-pct",
			"SEARCH_VIEW_ANOMALOUS_EMPTY_THRESHOLD_PCT",
			2
		),
		maxMissingDataRate: get(
			"search_view_missing_data_threshold_pct",
			"x-search-view-missing-data-threshold-pct",
			"SEARCH_VIEW_MISSING_DATA_THRESHOLD_PCT",
			2
		),
		maxP95LatencyMs: get(
			"search_view_p95_threshold_ms",
			"x-search-view-p95-threshold-ms",
			"SEARCH_VIEW_P95_THRESHOLD_MS",
			250
		),
	}
}

// Single source of truth for Search runtime health in new-only mode.
// Operational signals are always evaluated; functional mismatch signals are only enforced
// when shadow compare is enabled AND shadow executed at least once.
export const GET: APIRoute = async ({ request }) => {
	const context: FeatureFlagContext = { request }
	const functionalThresholds = getSearchHealthThresholds(context)
	const operationalThresholds = readThresholds(context)
	const summary = buildSearchShadowSummary("searchOffers")
	const functionalHealth = evaluateSearchEngineHealth({
		summary,
		thresholds: functionalThresholds,
	})

	const endpoint = "searchOffers"
	const totalRequests = readCounter("search_view_requests_total", { endpoint })
	const viewErrors = readCounter("search_view_error_total", { endpoint })
	const anomalousEmptyTotal = readCounter("search_view_anomalous_empty_total", { endpoint })
	const missingDataTotal = readCounter("search_view_empty_reason_total", {
		endpoint,
		reason: "missing_view_data",
	})
	const errorRatePct = pct(viewErrors, Math.max(1, totalRequests))
	const anomalousEmptyRatePct = pct(anomalousEmptyTotal, Math.max(1, totalRequests))
	const missingDataRatePct = pct(missingDataTotal, Math.max(1, totalRequests))
	const p95LatencyMs = readTimingQuantile("search_latency_ms", 0.95, {
		endpoint,
		engine: "new_pipeline",
	})
	const shadowEnabled = getFeatureFlag("SEARCH_SHADOW_COMPARE", context)
	// Functional mismatch health is only meaningful when shadow executed requests exist.
	// If shadow is off (or sampled out), health is evaluated with operational signals only.
	const shadowActive = shadowEnabled && Number(summary.shadow.executed ?? 0) > 0

	const reasons: string[] = []
	if (errorRatePct > operationalThresholds.maxErrorRate) {
		reasons.push(
			`error_rate_pct ${errorRatePct.toFixed(4)} > ${operationalThresholds.maxErrorRate.toFixed(4)}`
		)
	}
	if (anomalousEmptyRatePct > operationalThresholds.maxAnomalousEmptyRate) {
		reasons.push(
			`anomalous_empty_rate_pct ${anomalousEmptyRatePct.toFixed(4)} > ${operationalThresholds.maxAnomalousEmptyRate.toFixed(4)}`
		)
	}
	if (missingDataRatePct > operationalThresholds.maxMissingDataRate) {
		reasons.push(
			`missing_view_data_rate_pct ${missingDataRatePct.toFixed(4)} > ${operationalThresholds.maxMissingDataRate.toFixed(4)}`
		)
	}
	if (p95LatencyMs != null && p95LatencyMs > operationalThresholds.maxP95LatencyMs) {
		reasons.push(
			`p95_latency_ms ${Number(p95LatencyMs).toFixed(2)} > ${operationalThresholds.maxP95LatencyMs.toFixed(2)}`
		)
	}
	if (shadowActive && !functionalHealth.isHealthy) {
		reasons.push(...functionalHealth.reasons)
	}
	const status: SearchEngineStatus = reasons.length > 0 ? "degraded" : "healthy"

	return new Response(
		JSON.stringify({
			ok: true,
			status,
			health: {
				isHealthy: status === "healthy",
				reasons,
				operational: {
					totalRequests,
					viewErrors,
					errorRatePct,
					anomalousEmptyTotal,
					anomalousEmptyRatePct,
					missingDataTotal,
					missingDataRatePct,
					p95LatencyMs,
					window: getMetricsWindow(),
					thresholds: operationalThresholds,
				},
				functional: {
					enabled: shadowActive,
					shadowEnabled,
					shadowExecuted: Number(summary.shadow.executed ?? 0),
					metrics: functionalHealth.metrics,
					reasons: shadowActive ? functionalHealth.reasons : [],
					thresholds: functionalThresholds,
				},
			},
			current: {
				primaryEngine: "new",
			},
			shadow: summary,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
