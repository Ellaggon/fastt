import * as persistentCache from "./persistentCache"
import { recordCacheEvent } from "@/lib/observability/requestContext"

let cacheRequests = 0
let cacheHits = 0
const inFlight = new Map<string, Promise<unknown>>()

function durationSince(startedAt: number): number {
	return Number((performance.now() - startedAt).toFixed(1))
}

function logCacheResult(key: string, state: "hit" | "miss" | "coalesced", startedAt: number) {
	console.debug("cache", {
		key,
		state,
		durationMs: durationSince(startedAt),
		hitRatio: Number(((cacheHits / cacheRequests) * 100).toFixed(1)),
		requests: cacheRequests,
	})
}

export async function readThrough<TValue>(
	key: string,
	ttlSeconds: number,
	fetcher: () => Promise<TValue>
): Promise<TValue> {
	const startedAt = performance.now()
	cacheRequests += 1
	try {
		const cached = await persistentCache.get(key)
		if (cached !== null) {
			cacheHits += 1
			recordCacheEvent({
				key,
				state: "hit",
				durationMs: durationSince(startedAt),
			})
			logCacheResult(key, "hit", startedAt)
			return cached as TValue
		}
	} catch {}

	const existing = inFlight.get(key)
	if (existing) {
		const value = (await existing) as TValue
		cacheHits += 1
		recordCacheEvent({
			key,
			state: "hit",
			durationMs: durationSince(startedAt),
		})
		logCacheResult(key, "coalesced", startedAt)
		return value
	}

	const calculation = (async () => {
		const value = await fetcher()

		// Do not cache nulls to avoid stale not-found reads.
		if (value !== null) {
			void persistentCache.set(key, value, ttlSeconds).catch(() => {})
		}

		return value
	})()
	inFlight.set(key, calculation)

	try {
		const value = await calculation
		logCacheResult(key, "miss", startedAt)
		recordCacheEvent({
			key,
			state: "miss",
			durationMs: durationSince(startedAt),
		})

		return value
	} finally {
		if (inFlight.get(key) === calculation) inFlight.delete(key)
	}
}
