/**
 * Shared Tours rollout counters + stage dwell state.
 * Dual-write: process shared Map (aggregates workers in one deploy unit for tests)
 * and Redis INCR when configured (multi-instance durable aggregation).
 */
import * as persistentCache from "@/lib/cache/persistentCache"
import type { TourRolloutStage } from "@/lib/tours/tourRolloutCanary"

const COUNTER_PREFIX = "tours:rollout:counter:v1:"
const STATE_KEY = "tours:rollout:state:v1"
const DEFAULT_MIN_DWELL_MS = 24 * 60 * 60 * 1000
const REDIS_OP_TIMEOUT_MS = 1_500

function redisConfigured(): boolean {
	return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim())
}

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null
	try {
		return await Promise.race([
			promise,
			new Promise<T>((resolve) => {
				timer = setTimeout(() => resolve(fallback), REDIS_OP_TIMEOUT_MS)
			}),
		])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

type SharedRolloutState = {
	stage: TourRolloutStage
	enteredAtMs: number
}

type SharedRoot = {
	counters: Map<string, number>
	state: SharedRolloutState | null
	startedAtMs: number
}

function getRoot(): SharedRoot {
	const g = globalThis as unknown as { __tourRolloutSharedRoot?: SharedRoot }
	if (!g.__tourRolloutSharedRoot) {
		g.__tourRolloutSharedRoot = {
			counters: new Map(),
			state: null,
			startedAtMs: Date.now(),
		}
	}
	return g.__tourRolloutSharedRoot
}

function counterRedisKey(metricKey: string): string {
	return `${COUNTER_PREFIX}${metricKey}`
}

export function incrementSharedTourCounter(metricKey: string, delta = 1): number {
	const root = getRoot()
	const next = Number(root.counters.get(metricKey) ?? 0) + Number(delta)
	root.counters.set(metricKey, next)
	void persistentCache.incrBy(counterRedisKey(metricKey), Number(delta) || 0).catch(() => null)
	return next
}

export function listSharedTourCounters(prefix: string): Array<{ key: string; value: number }> {
	const root = getRoot()
	return Array.from(root.counters.entries())
		.filter(([key]) => key.startsWith(prefix))
		.map(([key, value]) => ({ key, value: Number(value) }))
		.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Read Redis INCR values (bare integers) via INCRBY 0 and merge max(local, remote).
 */
export async function syncSharedTourCountersFromRedis(): Promise<{
	backend: "redis" | "memory"
	keys: number
}> {
	if (!redisConfigured()) {
		return { backend: "memory", keys: getRoot().counters.size }
	}
	return await withTimeout(
		(async () => {
			const status = await persistentCache.getRuntimeStatus()
			if (status.activeBackend === "memory") {
				return { backend: "memory" as const, keys: getRoot().counters.size }
			}
			const keys = await persistentCache.listKeysByPrefix(COUNTER_PREFIX)
			const root = getRoot()
			for (const redisKey of keys) {
				const metricKey = redisKey.slice(COUNTER_PREFIX.length)
				if (!metricKey) continue
				const remote = await persistentCache.incrBy(redisKey, 0)
				if (remote == null || !Number.isFinite(remote)) continue
				const local = Number(root.counters.get(metricKey) ?? 0)
				root.counters.set(metricKey, Math.max(local, Number(remote)))
			}
			return { backend: "redis" as const, keys: keys.length }
		})(),
		{ backend: "memory", keys: getRoot().counters.size }
	)
}

export function getSharedMetricsWindow(): { startedAtMs: number; uptimeMs: number } {
	const root = getRoot()
	return {
		startedAtMs: root.startedAtMs,
		uptimeMs: Math.max(0, Date.now() - root.startedAtMs),
	}
}

export function getTourRolloutMinDwellMs(env?: Record<string, string | undefined> | null): number {
	const raw = String((env ?? process.env).TOURS_ROLLOUT_MIN_DWELL_MS ?? "").trim()
	if (!raw) return DEFAULT_MIN_DWELL_MS
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MIN_DWELL_MS
	return Math.floor(parsed)
}

function readEnvStageEnteredAt(env?: Record<string, string | undefined> | null): number | null {
	const raw = String((env ?? process.env).TOURS_ROLLOUT_STAGE_ENTERED_AT ?? "").trim()
	if (!raw) return null
	const asNumber = Number(raw)
	if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber)
	const asDate = Date.parse(raw)
	return Number.isFinite(asDate) ? asDate : null
}

/**
 * Track when the current stage was entered. Persists in shared memory and Redis JSON.
 * Env TOURS_ROLLOUT_STAGE_ENTERED_AT overrides when set (ops pinning).
 */
export function ensureTourRolloutStageDwell(
	stage: TourRolloutStage,
	env?: Record<string, string | undefined> | null
): SharedRolloutState {
	const root = getRoot()
	const envEntered = readEnvStageEnteredAt(env)
	if (envEntered != null) {
		const pinned = { stage, enteredAtMs: envEntered }
		root.state = pinned
		return pinned
	}
	if (!root.state || root.state.stage !== stage) {
		root.state = { stage, enteredAtMs: Date.now() }
		void persistentCache.set(STATE_KEY, root.state, 60 * 60 * 24 * 30).catch(() => null)
	}
	return root.state
}

export async function loadTourRolloutStageDwell(
	stage: TourRolloutStage,
	env?: Record<string, string | undefined> | null
): Promise<SharedRolloutState> {
	const envEntered = readEnvStageEnteredAt(env)
	if (envEntered != null) {
		const pinned = { stage, enteredAtMs: envEntered }
		getRoot().state = pinned
		return pinned
	}
	if (!redisConfigured()) {
		return ensureTourRolloutStageDwell(stage, env)
	}
	const cached = (await withTimeout(
		persistentCache.get(STATE_KEY) as Promise<SharedRolloutState | null>,
		null
	)) as SharedRolloutState | null
	const root = getRoot()
	if (cached && cached.stage === stage && Number.isFinite(Number(cached.enteredAtMs))) {
		root.state = {
			stage: cached.stage,
			enteredAtMs: Number(cached.enteredAtMs),
		}
		return root.state
	}
	return ensureTourRolloutStageDwell(stage, env)
}

export function evaluateDwellWindow(input: {
	stage: TourRolloutStage
	enteredAtMs: number
	nowMs?: number
	env?: Record<string, string | undefined> | null
}): {
	ready: boolean
	minDwellMs: number
	elapsedMs: number
	remainingMs: number
} {
	const minDwellMs = getTourRolloutMinDwellMs(input.env)
	const elapsedMs = Math.max(0, (input.nowMs ?? Date.now()) - input.enteredAtMs)
	const remainingMs = Math.max(0, minDwellMs - elapsedMs)
	return {
		ready: elapsedMs >= minDwellMs,
		minDwellMs,
		elapsedMs,
		remainingMs,
	}
}

export function resetTourRolloutSharedStoreForTests(): void {
	const root = getRoot()
	root.counters.clear()
	root.state = null
	root.startedAtMs = Date.now()
}

/** Test helper: simulate a second instance sharing the same counter Map. */
export function readSharedTourCounter(metricKey: string): number {
	return Number(getRoot().counters.get(metricKey) ?? 0)
}
