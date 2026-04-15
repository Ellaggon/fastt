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
