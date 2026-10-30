import { AsyncLocalStorage } from "node:async_hooks"

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>()

/** A fresh scope per read operation; never reuse it across commands or requests. */
export function withCommercialReadScope<T>(work: () => Promise<T>): Promise<T> {
	return scope.getStore() ? work() : scope.run(new Map(), work)
}

export function commercialReadOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
	const reads = scope.getStore()
	if (!reads) return load()
	const existing = reads.get(key)
	if (existing) return existing as Promise<T>
	const pending = Promise.resolve().then(load)
	reads.set(key, pending)
	return pending
}
