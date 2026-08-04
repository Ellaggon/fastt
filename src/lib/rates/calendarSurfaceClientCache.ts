type CacheEntry<TValue> = {
	value: TValue
	expiresAt: number
}

export function createBoundedClientCache<TValue>(
	maxEntries = 12,
	ttlMs = Number.POSITIVE_INFINITY
) {
	const entries = new Map<string, CacheEntry<TValue>>()
	const limit = Math.max(1, Math.floor(maxEntries))
	const ttl = Math.max(0, ttlMs)

	return {
		get(key: string): TValue | null {
			const entry = entries.get(key)
			if (!entry) return null
			if (entry.expiresAt <= Date.now()) {
				entries.delete(key)
				return null
			}
			entries.delete(key)
			entries.set(key, entry)
			return entry.value
		},
		set(key: string, value: TValue): void {
			entries.delete(key)
			entries.set(key, { value, expiresAt: Date.now() + ttl })
			while (entries.size > limit) {
				const oldest = entries.keys().next().value
				if (typeof oldest !== "string") break
				entries.delete(oldest)
			}
		},
		delete(key: string): void {
			entries.delete(key)
		},
		clear(): void {
			entries.clear()
		},
	}
}
