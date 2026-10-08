/** Read-only observations shared inside a GET, never across requests or commands. */
const reads = new WeakMap<Request, Map<string, Promise<unknown>>>()
export function readTourRequestData<T>(
	request: Request | undefined,
	key: string,
	load: () => Promise<T>
): Promise<T> {
	if (!request || request.method !== "GET") return load()
	let cache = reads.get(request)
	if (!cache) {
		cache = new Map()
		reads.set(request, cache)
	}
	const existing = cache.get(key)
	if (existing) return existing as Promise<T>
	const pending = load()
	cache.set(key, pending)
	return pending
}
