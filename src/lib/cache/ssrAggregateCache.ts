import { delByPrefix } from "./persistentCache"

type CacheEntry<TValue> = {
	value: TValue
	expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const tagIndex = new Map<string, Set<string>>()

const MIN_TTL_MS = 3_000
const MAX_TTL_MS = 10_000
const DEFAULT_TTL_MS = clampTtl(Number(process.env.AGGREGATE_CACHE_TTL_MS ?? 5_000))

function clampTtl(ttlMs: number): number {
	if (!Number.isFinite(ttlMs)) return 5_000
	return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.floor(ttlMs)))
}

function cloneForRead<TValue>(value: TValue): TValue {
	try {
		return structuredClone(value)
	} catch {
		return JSON.parse(JSON.stringify(value)) as TValue
	}
}

function removeKey(key: string): void {
	cache.delete(key)
	for (const [tag, keys] of tagIndex.entries()) {
		if (!keys.delete(key)) continue
		if (keys.size === 0) tagIndex.delete(tag)
	}
}

function sweepExpired(now: number = Date.now()): void {
	for (const [key, entry] of cache.entries()) {
		if (entry.expiresAt <= now) removeKey(key)
	}
}

export function getAggregateCache<TValue>(key: string): TValue | null {
	const now = Date.now()
	const entry = cache.get(key)
	if (!entry) return null
	if (entry.expiresAt <= now) {
		removeKey(key)
		return null
	}
	return cloneForRead(entry.value as TValue)
}

export function setAggregateCache<TValue>(
	key: string,
	value: TValue,
	options?: { ttlMs?: number; tags?: string[] }
): void {
	const ttlMs = clampTtl(options?.ttlMs ?? DEFAULT_TTL_MS)
	const expiresAt = Date.now() + ttlMs
	cache.set(key, { value: cloneForRead(value), expiresAt })

	for (const tag of options?.tags ?? []) {
		if (!tag) continue
		const keys = tagIndex.get(tag) ?? new Set<string>()
		keys.add(key)
		tagIndex.set(tag, keys)
	}

	if (cache.size > 500) sweepExpired()
}

export function invalidateAggregateTag(tag: string): void {
	if (!tag) return
	const keys = tagIndex.get(tag)
	if (!keys || keys.size === 0) return
	for (const key of keys) cache.delete(key)
	tagIndex.delete(tag)

	// Compatibility bridge: keep legacy invalidation callers effective for new persistent cache keys.
	if (tag.startsWith("product:")) {
		const id = tag.slice("product:".length)
		void delByPrefix(`ws:product:${id}:`)
	}
	if (tag.startsWith("variant:")) {
		const id = tag.slice("variant:".length)
		void delByPrefix(`ws:variant:${id}:`)
	}
	if (tag.startsWith("provider:")) {
		const id = tag.slice("provider:".length)
		void delByPrefix(`ws:provider:${id}:`)
	}
}

export function invalidateAggregateCache(params: {
	productId?: string | null
	variantId?: string | null
	providerId?: string | null
}): void {
	if (params.productId) invalidateAggregateTag(`product:${params.productId}`)
	if (params.variantId) invalidateAggregateTag(`variant:${params.variantId}`)
	if (params.providerId) invalidateAggregateTag(`provider:${params.providerId}`)
}

export function clearAggregateCache(): void {
	cache.clear()
	tagIndex.clear()
	void delByPrefix("ws:")
}
