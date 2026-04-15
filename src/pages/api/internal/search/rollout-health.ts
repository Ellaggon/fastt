import type { APIRoute } from "astro"

import { getMetricsWindow, readCounter, readTimingQuantile } from "@/lib/observability/metrics"

function pct(part: number, total: number): number {
	if (total <= 0) return 0
	return Number(((part / total) * 100).toFixed(4))
}

export const GET: APIRoute = async () => {
	const endpoint = "searchOffers"
	const errorThreshold = Number(process.env.SEARCH_VIEW_ERROR_THRESHOLD_PCT ?? "1")
	const missingDataThreshold = Number(process.env.SEARCH_VIEW_MISSING_DATA_THRESHOLD_PCT ?? "2")
	const anomalousEmptyThreshold = Number(
		process.env.SEARCH_VIEW_ANOMALOUS_EMPTY_THRESHOLD_PCT ?? "2"
	)
	const p95ThresholdMs = Number(process.env.SEARCH_VIEW_P95_THRESHOLD_MS ?? "250")

	const totalRequests = readCounter("search_view_requests_total", { endpoint })
	const viewErrors = readCounter("search_view_error_total", { endpoint })
	const anomalousEmptyTotal = readCounter("search_view_anomalous_empty_total", { endpoint })
	const staleOrMissingTotal = readCounter("search_view_empty_reason_total", {
		endpoint,
		reason: "missing_view_data",
	})

	const errorRatePct = pct(viewErrors, Math.max(1, totalRequests))
	const staleOrMissingRatePct = pct(staleOrMissingTotal, Math.max(1, totalRequests))
	const anomalousEmptyRatePct = pct(anomalousEmptyTotal, Math.max(1, totalRequests))

	const p95ViewMs = readTimingQuantile("search_latency_ms", 0.95, {
		endpoint,
		engine: "view",
	})

	const window = getMetricsWindow()
	const uptimeMinutes = Math.max(1, Math.floor(window.uptimeMs / 60_000))
	const throughputPerMinute = Number((totalRequests / uptimeMinutes).toFixed(4))

	const alerts: Array<{ type: "warning" | "critical"; code: string; message: string }> = []
	if (staleOrMissingRatePct > missingDataThreshold) {
		alerts.push({
			type: "warning",
			code: "missing_view_data_high",
			message: `Missing view data rate ${staleOrMissingRatePct}% > threshold ${missingDataThreshold}%`,
		})
	}
	if (errorRatePct > errorThreshold) {
		alerts.push({
			type: "critical",
			code: "view_error_rate_high",
			message: `View error rate ${errorRatePct}% > threshold ${errorThreshold}%`,
		})
	}
	if (anomalousEmptyRatePct > anomalousEmptyThreshold) {
		alerts.push({
			type: "warning",
			code: "anomalous_empty_rate_high",
			message: `Anomalous empty rate ${anomalousEmptyRatePct}% > threshold ${anomalousEmptyThreshold}%`,
		})
	}
	if (p95ViewMs != null && p95ViewMs > p95ThresholdMs) {
		alerts.push({
			type: "warning",
			code: "p95_latency_high",
			message: `P95 latency ${p95ViewMs}ms > threshold ${p95ThresholdMs}ms`,
		})
	}

	return new Response(
		JSON.stringify({
			ok: true,
			window,
			traffic: {
				totalRequests,
				viewSharePct: 100,
			},
			reliability: {
				viewErrors,
				errorRatePct,
				staleOrMissingTotal,
				staleOrMissingRatePct,
				anomalousEmptyTotal,
				anomalousEmptyRatePct,
			},
			performance: {
				p95ViewMs,
				throughputPerMinute,
				estimatedCostPerRequest: {
					viewQueryCostUnits: 1,
				},
			},
			alerts,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
