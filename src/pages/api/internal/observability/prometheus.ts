import type { APIRoute } from "astro"

import {
	listAllCounters,
	listTimingKeys,
	readTimingCountByKey,
	readTimingQuantile,
} from "@/lib/observability/metrics"

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

export const GET: APIRoute = async () => {
	const lines: string[] = []

	for (const counter of listAllCounters()) {
		const parsed = parseMetricKey(counter.key)
		const name = sanitizeMetricName(parsed.name)
		lines.push(`${name}${labelsToProm(parsed.labels)} ${Number(counter.value)}`)
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

	return new Response(lines.join("\n"), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; version=0.0.4; charset=utf-8",
			"Cache-Control": "no-store",
		},
	})
}
