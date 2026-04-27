import { logger } from "./logger"

type MetricTags = Record<string, string | number | boolean>

type MetricState = {
	counters: Map<string, number>
	timings: Map<string, number[]>
	startedAtMs: number
}

function getState(): MetricState {
	const g = globalThis as unknown as { __appMetricsState?: MetricState }
	if (!g.__appMetricsState) {
		g.__appMetricsState = {
			counters: new Map<string, number>(),
			timings: new Map<string, number[]>(),
			startedAtMs: Date.now(),
		}
	}
	return g.__appMetricsState
}

function keyFrom(name: string, tags?: MetricTags): string {
	if (!tags || Object.keys(tags).length === 0) return name
	const encoded = Object.entries(tags)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${String(v)}`)
		.join(",")
	return `${name}|${encoded}`
}

export function parseCounterKey(key: string): { name: string; labels: Record<string, string> } {
	const [name, encoded = ""] = String(key).split("|")
	const labels: Record<string, string> = {}
	if (encoded.trim().length === 0) return { name, labels }
	for (const pair of encoded.split(",")) {
		const [k, v = ""] = pair.split("=")
		if (!k) continue
		labels[k.trim()] = v.trim()
	}
	return { name, labels }
}

export function incrementCounter(name: string, tags?: MetricTags, delta = 1): number {
	const state = getState()
	const key = keyFrom(name, tags)
	const next = Number(state.counters.get(key) ?? 0) + delta
	state.counters.set(key, next)
	logger.debug("metric.increment", {
		name,
		tags: tags ?? null,
		delta,
		value: next,
	})
	return next
}

export function readCounter(name: string, tags?: MetricTags): number {
	const state = getState()
	return Number(state.counters.get(keyFrom(name, tags)) ?? 0)
}

export function observeTiming(name: string, valueMs: number, tags?: MetricTags): void {
	const state = getState()
	const key = keyFrom(name, tags)
	const bucket = state.timings.get(key) ?? []
	bucket.push(Number(valueMs))
	const MAX_SAMPLES = 5_000
	if (bucket.length > MAX_SAMPLES) {
		bucket.splice(0, bucket.length - MAX_SAMPLES)
	}
	state.timings.set(key, bucket)
	logger.debug("metric.observe_timing", {
		name,
		tags: tags ?? null,
		valueMs: Number(valueMs),
		samples: bucket.length,
	})
}

export function readTimingQuantile(
	name: string,
	quantile: number,
	tags?: MetricTags
): number | null {
	const state = getState()
	const key = keyFrom(name, tags)
	const bucket = state.timings.get(key) ?? []
	if (bucket.length === 0) return null
	const q = Math.min(1, Math.max(0, Number(quantile)))
	const sorted = [...bucket].sort((a, b) => a - b)
	const idx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))
	return Number(sorted[idx] ?? null)
}

export function listCountersByPrefix(prefix: string): Array<{ key: string; value: number }> {
	const state = getState()
	return Array.from(state.counters.entries())
		.filter(([key]) => key.startsWith(prefix))
		.map(([key, value]) => ({ key, value: Number(value) }))
		.sort((a, b) => a.key.localeCompare(b.key))
}

export function listAllCounters(): Array<{ key: string; value: number }> {
	const state = getState()
	return Array.from(state.counters.entries())
		.map(([key, value]) => ({ key, value: Number(value) }))
		.sort((a, b) => a.key.localeCompare(b.key))
}

export function listTimingKeys(): string[] {
	const state = getState()
	return Array.from(state.timings.keys()).sort((a, b) => a.localeCompare(b))
}

export function readTimingCountByKey(key: string): number {
	const state = getState()
	const bucket = state.timings.get(key) ?? []
	return bucket.length
}

export function getMetricsWindow(): { startedAtMs: number; uptimeMs: number } {
	const state = getState()
	return {
		startedAtMs: state.startedAtMs,
		uptimeMs: Math.max(0, Date.now() - state.startedAtMs),
	}
}

export function recordPolicyContractPathUsage(input: {
	endpoint: string
	contract: "v2" | "legacy"
}): void {
	const tags = {
		endpoint: String(input.endpoint || "unknown"),
		contract: input.contract,
	}
	incrementCounter("policy_contract_path_used_total", tags, 1)
	if (input.contract === "v2") {
		incrementCounter("policy_dto_v2_usage_total", { endpoint: tags.endpoint }, 1)
	} else {
		incrementCounter("policy_legacy_usage_total", { endpoint: tags.endpoint }, 1)
	}
}

export function readPolicyContractUsageByEndpoint(endpoint: string): {
	endpoint: string
	total: number
	v2: number
	legacy: number
	policy_dto_v2_usage_rate: number
	policy_legacy_usage_rate: number
} {
	const key = String(endpoint || "unknown")
	const v2 = readCounter("policy_dto_v2_usage_total", { endpoint: key })
	const legacy = readCounter("policy_legacy_usage_total", { endpoint: key })
	const total = v2 + legacy
	const safe = total > 0 ? total : 1
	return {
		endpoint: key,
		total,
		v2,
		legacy,
		policy_dto_v2_usage_rate: v2 / safe,
		policy_legacy_usage_rate: legacy / safe,
	}
}

export function recordSearchComparisonBreakdown(input: {
	endpoint: string
	sellableMismatch: boolean
	reasonCodeMismatch: boolean
	priceMismatch: boolean
	dateRange?: string
	ratePlanId?: string
	occupancy?: string
	lengthOfStay?: number
	includeGlobal?: boolean
}): void {
	const endpoint = String(input.endpoint || "search")
	const includeGlobal = input.includeGlobal !== false
	const segmentedTags =
		input.dateRange || input.ratePlanId || input.occupancy || input.lengthOfStay != null
			? {
					endpoint,
					dateRange: String(input.dateRange || "unknown"),
					ratePlanId: String(input.ratePlanId || "unknown"),
					occupancy: String(input.occupancy || "unknown"),
					lengthOfStay: Number(input.lengthOfStay ?? 0),
				}
			: null
	if (includeGlobal) {
		incrementCounter("search_comparison_total", { endpoint }, 1)
	}
	if (segmentedTags) {
		incrementCounter("search_comparison_total", segmentedTags, 1)
	}
	if (input.sellableMismatch) {
		if (includeGlobal) {
			incrementCounter("search_sellable_mismatch_total", { endpoint }, 1)
		}
		if (segmentedTags) {
			incrementCounter("search_sellable_mismatch_total", segmentedTags, 1)
		}
	}
	if (input.reasonCodeMismatch) {
		if (includeGlobal) {
			incrementCounter("search_reason_code_mismatch_total", { endpoint }, 1)
		}
		if (segmentedTags) {
			incrementCounter("search_reason_code_mismatch_total", segmentedTags, 1)
		}
	}
	if (input.priceMismatch) {
		if (includeGlobal) {
			incrementCounter("search_price_mismatch_total", { endpoint }, 1)
		}
		if (segmentedTags) {
			incrementCounter("search_price_mismatch_total", segmentedTags, 1)
		}
	}
}

export function recordSearchDecisionMismatchBreakdown(input: {
	endpoint: string
	dateRange: string
	ratePlanId: string
	occupancy: string
	lengthOfStay: number
	baselineReasonCode: string
	candidateReasonCode: string
	sellableMismatch: boolean
	reasonCodeMismatch: boolean
	priceMismatch: boolean
}): void {
	const endpoint = String(input.endpoint || "search")
	const dateRange = String(input.dateRange || "unknown")
	const ratePlanId = String(input.ratePlanId || "unknown")
	if (input.reasonCodeMismatch) {
		incrementCounter(
			"search_reason_code_pair_mismatch_total",
			{
				endpoint,
				dateRange,
				occupancy: String(input.occupancy || "unknown"),
				lengthOfStay: Number(input.lengthOfStay ?? 0),
				baselineReasonCode: String(input.baselineReasonCode || "NONE"),
				candidateReasonCode: String(input.candidateReasonCode || "NONE"),
			},
			1
		)
	}
	if (input.sellableMismatch) {
		incrementCounter(
			"search_mismatch_by_rateplan_total",
			{
				endpoint,
				dateRange,
				ratePlanId,
				occupancy: String(input.occupancy || "unknown"),
				lengthOfStay: Number(input.lengthOfStay ?? 0),
				kind: "sellable",
			},
			1
		)
	}
	if (input.reasonCodeMismatch) {
		incrementCounter(
			"search_mismatch_by_rateplan_total",
			{
				endpoint,
				dateRange,
				ratePlanId,
				occupancy: String(input.occupancy || "unknown"),
				lengthOfStay: Number(input.lengthOfStay ?? 0),
				kind: "reason_code",
			},
			1
		)
	}
	if (input.priceMismatch) {
		incrementCounter(
			"search_mismatch_by_rateplan_total",
			{
				endpoint,
				dateRange,
				ratePlanId,
				occupancy: String(input.occupancy || "unknown"),
				lengthOfStay: Number(input.lengthOfStay ?? 0),
				kind: "price",
			},
			1
		)
	}
}

export function readSearchComparisonRates(endpoint: string): {
	endpoint: string
	total: number
	search_sellable_mismatch_rate: number
	search_reason_code_mismatch_rate: number
	search_price_mismatch_rate: number
} {
	const key = String(endpoint || "search")
	const total = readCounter("search_comparison_total", { endpoint: key })
	const safe = total > 0 ? total : 1
	return {
		endpoint: key,
		total,
		search_sellable_mismatch_rate:
			readCounter("search_sellable_mismatch_total", { endpoint: key }) / safe,
		search_reason_code_mismatch_rate:
			readCounter("search_reason_code_mismatch_total", { endpoint: key }) / safe,
		search_price_mismatch_rate:
			readCounter("search_price_mismatch_total", { endpoint: key }) / safe,
	}
}

export type MigrationMetricInput = {
	domain: string
	endpoint: string
	outcome?: "ok" | "mismatch" | "fallback" | "error"
	durationMs?: number
	tags?: MetricTags
}

function withMigrationTags(input: MigrationMetricInput): MetricTags {
	return {
		domain: input.domain,
		endpoint: input.endpoint,
		...(input.tags ?? {}),
	}
}

export function recordMigrationMetric(input: MigrationMetricInput): void {
	const tags = withMigrationTags(input)
	incrementCounter("migration_requests_total", tags, 1)
	if (input.outcome === "mismatch") incrementCounter("migration_mismatch_total", tags, 1)
	if (input.outcome === "fallback") incrementCounter("migration_fallback_total", tags, 1)
	if (input.outcome === "error") incrementCounter("migration_error_total", tags, 1)
	if (Number.isFinite(Number(input.durationMs ?? NaN))) {
		observeTiming("migration_latency_ms", Number(input.durationMs), tags)
	}
}

export function readMigrationSummary(
	domain: string,
	endpoint: string,
	tags?: MetricTags
): {
	requests: number
	mismatches: number
	fallbacks: number
	errors: number
	mismatchRate: number
	fallbackRate: number
	errorRate: number
	latency: { p50: number | null; p95: number | null; p99: number | null }
} {
	const metricTags = withMigrationTags({ domain, endpoint, tags })
	const requests = readCounter("migration_requests_total", metricTags)
	const mismatches = readCounter("migration_mismatch_total", metricTags)
	const fallbacks = readCounter("migration_fallback_total", metricTags)
	const errors = readCounter("migration_error_total", metricTags)
	const safeDenominator = requests > 0 ? requests : 1
	return {
		requests,
		mismatches,
		fallbacks,
		errors,
		mismatchRate: mismatches / safeDenominator,
		fallbackRate: fallbacks / safeDenominator,
		errorRate: errors / safeDenominator,
		latency: {
			p50: readTimingQuantile("migration_latency_ms", 0.5, metricTags),
			p95: readTimingQuantile("migration_latency_ms", 0.95, metricTags),
			p99: readTimingQuantile("migration_latency_ms", 0.99, metricTags),
		},
	}
}
