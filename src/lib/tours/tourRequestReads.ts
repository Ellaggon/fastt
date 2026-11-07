import { AsyncLocalStorage } from "node:async_hooks"

const operationReads = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/** Post-commit projection reads get a fresh scope, never the command's earlier observations. */
export function withTourProjectionReads<T>(load: () => Promise<T>): Promise<T> {
	return operationReads.run(new Map(), load)
}

/** Read-only observations shared inside a GET or an explicit post-commit projection. */
const reads = new WeakMap<Request, Map<string, Promise<unknown>>>()
export function readTourRequestData<T>(
	request: Request | undefined,
	key: string,
	load: () => Promise<T>
): Promise<T> {
	const operation = operationReads.getStore()
	if (operation) {
		const existing = operation.get(key)
		if (existing) return existing as Promise<T>
		const pending = Promise.resolve().then(load)
		operation.set(key, pending)
		return pending
	}
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
