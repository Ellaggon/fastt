import * as persistentCache from "./persistentCache"

let cacheRequests = 0
let cacheHits = 0

export async function readThrough<TValue>(
	key: string,
	ttlSeconds: number,
	fetcher: () => Promise<TValue>
): Promise<TValue> {
	const startedAt = performance.now()
	cacheRequests += 1
	let hit = false
	try {
		const cached = await persistentCache.get(key)
		if (cached !== null) {
			hit = true
			cacheHits += 1
			console.debug("cache", {
				key,
				hit,
				durationMs: Number((performance.now() - startedAt).toFixed(1)),
				hitRatio: Number(((cacheHits / cacheRequests) * 100).toFixed(1)),
				requests: cacheRequests,
			})
			return cached as TValue
		}
	} catch {
		hit = false
	}

	const value = await fetcher()

	// Keep current behavior: do not cache nulls to avoid stale not-found reads.
	if (value !== null) {
		void persistentCache.set(key, value, ttlSeconds).catch(() => {})
	}

	console.debug("cache", {
		key,
		hit,
		durationMs: Number((performance.now() - startedAt).toFixed(1)),
		hitRatio: Number(((cacheHits / cacheRequests) * 100).toFixed(1)),
		requests: cacheRequests,
	})

	return value
}
