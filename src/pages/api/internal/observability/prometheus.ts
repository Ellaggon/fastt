import type { APIRoute } from "astro"

import {
	isInternalObservabilityAuthorized,
	unauthorizedObservabilityResponse,
} from "@/lib/observability/internalObservabilityAuth"
import {
	listAllCounters,
	listAllGauges,
	listTimingKeys,
	readTimingCountByKey,
	readTimingQuantile,
} from "@/lib/observability/metrics"
import { collectProviderIntegrationOperationalMetrics } from "@/lib/provider-integration-operational-metrics"
import { collectPricingBulkOperationalMetrics } from "@/lib/pricing/pricing-bulk-operational-metrics"
import { collectTourRolloutPrometheusMetrics } from "@/lib/tours/tourObservability"
import { syncSharedTourCountersFromRedis } from "@/lib/tours/tourRolloutSharedStore"

type ParsedMetricKey = {
	name: string
	labels: Record<string, string>
}

function parseMetricKey(key: string): ParsedMetricKey {
	const [name, rawLabels = ""] = key.split("|")
	const labels: Record<string, string> = {}
	if (rawLabels.trim().length > 0) {
		for (const pair of rawLabels.split(",")) {
			const [k, v = ""] = pair.split("=")
			if (!k) continue
			labels[k.trim()] = v.trim()
		}
	}
	return { name, labels }
}

function sanitizeMetricName(name: string): string {
	return String(name)
		.replace(/[^a-zA-Z0-9_:]/g, "_")
		.replace(/_+/g, "_")
}

function labelsToProm(labels: Record<string, string>): string {
	const entries = Object.entries(labels)
	if (entries.length === 0) return ""
	const serialized = entries
		.map(([k, v]) => `${k.replace(/[^a-zA-Z0-9_]/g, "_")}="${String(v).replace(/"/g, '\\"')}"`)
		.join(",")
	return `{${serialized}}`
}

export const GET: APIRoute = async ({ request }) => {
	if (!isInternalObservabilityAuthorized(request)) {
		return unauthorizedObservabilityResponse()
	}

	await syncSharedTourCountersFromRedis().catch(() => null)
	const lines: string[] = []

	for (const counter of listAllCounters()) {
		const parsed = parseMetricKey(counter.key)
		const name = sanitizeMetricName(parsed.name)
		lines.push(`${name}${labelsToProm(parsed.labels)} ${Number(counter.value)}`)
	}

	for (const gauge of listAllGauges()) {
		const parsed = parseMetricKey(gauge.key)
		const name = sanitizeMetricName(parsed.name)
		lines.push(`${name}${labelsToProm(parsed.labels)} ${Number(gauge.value)}`)
	}

	for (const key of listTimingKeys()) {
		const parsed = parseMetricKey(key)
		const base = sanitizeMetricName(parsed.name)
		const labels = parsed.labels
		const count = readTimingCountByKey(key)
		const p50 = readTimingQuantile(parsed.name, 0.5, parsed.labels)
		const p95 = readTimingQuantile(parsed.name, 0.95, parsed.labels)
		const p99 = readTimingQuantile(parsed.name, 0.99, parsed.labels)

		lines.push(`${base}_count${labelsToProm(labels)} ${count}`)
		if (p50 != null) {
			lines.push(`${base}_p50_ms${labelsToProm(labels)} ${Number(p50)}`)
		}
		if (p95 != null) {
			lines.push(`${base}_p95_ms${labelsToProm(labels)} ${Number(p95)}`)
		}
		if (p99 != null) {
			lines.push(`${base}_p99_ms${labelsToProm(labels)} ${Number(p99)}`)
		}
	}

	try {
		const operationalMetrics = await collectProviderIntegrationOperationalMetrics()
		for (const metric of operationalMetrics) {
			lines.push(
				`${sanitizeMetricName(metric.name)}${labelsToProm(metric.labels ?? {})} ${Number(metric.value)}`
			)
		}
		lines.push("provider_integration_operational_metrics_collection_error 0")
	} catch {
		lines.push("provider_integration_operational_metrics_collection_error 1")
	}

	try {
		const operationalMetrics = await collectPricingBulkOperationalMetrics()
		for (const metric of operationalMetrics) {
			lines.push(
				`${sanitizeMetricName(metric.name)}${labelsToProm(metric.labels ?? {})} ${Number(metric.value)}`
			)
		}
		lines.push("pricing_bulk_operational_metrics_collection_error 0")
	} catch {
		lines.push("pricing_bulk_operational_metrics_collection_error 1")
	}

	try {
		for (const metric of collectTourRolloutPrometheusMetrics()) {
			lines.push(
				`${sanitizeMetricName(metric.name)}${labelsToProm(metric.labels ?? {})} ${Number(metric.value)}`
			)
		}
		lines.push("tours_rollout_metrics_collection_error 0")
	} catch {
		lines.push("tours_rollout_metrics_collection_error 1")
	}

	return new Response(lines.join("\n"), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; version=0.0.4; charset=utf-8",
			"Cache-Control": "no-store",
		},
	})
}
