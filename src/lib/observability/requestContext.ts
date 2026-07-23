import { AsyncLocalStorage } from "node:async_hooks"

export type FasttCacheState = "hit" | "miss" | "stale"

export type FasttCacheEvent = {
	key: string
	state: FasttCacheState
	durationMs: number
}

export type FasttRequestContext = {
	id: string
	startedAt: number
	cacheEvents: FasttCacheEvent[]
}

const storage = new AsyncLocalStorage<FasttRequestContext>()

export function runWithRequestContext<TValue>(
	context: FasttRequestContext,
	fn: () => TValue
): TValue {
	return storage.run(context, fn)
}

export function getRequestContext(): FasttRequestContext | undefined {
	return storage.getStore()
}

export function recordCacheEvent(event: FasttCacheEvent): void {
	const context = getRequestContext()
	if (!context) return
	context.cacheEvents.push(event)
}

export function summarizeCacheEvents(events = getRequestContext()?.cacheEvents ?? []): {
	state: FasttCacheState | "none"
	detail: string
	hits: number
	misses: number
	stale: number
	total: number
} {
	const hits = events.filter((event) => event.state === "hit").length
	const misses = events.filter((event) => event.state === "miss").length
	const stale = events.filter((event) => event.state === "stale").length
	const total = events.length
	const state: FasttCacheState | "none" =
		stale > 0 ? "stale" : misses > 0 ? "miss" : hits > 0 ? "hit" : "none"
	return {
		state,
		detail: `hit=${hits};miss=${misses};stale=${stale};total=${total}`,
		hits,
		misses,
		stale,
		total,
	}
}

export function currentRegion(): string {
	return (
		process.env.FASTT_REGION?.trim() ||
		process.env.VERCEL_REGION?.trim() ||
		process.env.AWS_REGION?.trim() ||
		process.env.FLY_REGION?.trim() ||
		"local"
	)
}
