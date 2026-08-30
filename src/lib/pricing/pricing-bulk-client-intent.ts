function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`
}

function shortHash(value: string): string {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0).toString(36)
}

export type PricingBulkClientIntent = {
	idempotencyKey: string
	storageKey: string
}

function readSessionValue(key: string): string {
	try {
		return globalThis.sessionStorage?.getItem(key)?.trim() ?? ""
	} catch {
		return ""
	}
}

function writeSessionValue(key: string, value: string) {
	try {
		globalThis.sessionStorage?.setItem(key, value)
	} catch {
		// A blocked storage API must not prevent the administrator's operation.
	}
}

function removeSessionValue(key: string) {
	try {
		globalThis.sessionStorage?.removeItem(key)
	} catch {
		// The server still protects duplicate writes with its durable key contract.
	}
}

/** Keeps one request identity across rerenders, reloads and uncertain responses. */
export function getOrCreatePricingBulkClientIntent(params: {
	surface: string
	mode: "apply" | "preview"
	payload: unknown
}): PricingBulkClientIntent {
	const signature = shortHash(stableJson(params.payload))
	const storageKey = `fastt:pricing-bulk:${params.surface}:${params.mode}:${signature}`
	const stored = readSessionValue(storageKey)
	if (stored) return { idempotencyKey: stored, storageKey }
	const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${signature}`
	const idempotencyKey = `pricing-bulk:${params.surface}:${params.mode}:${suffix}`
	writeSessionValue(storageKey, idempotencyKey)
	return { idempotencyKey, storageKey }
}

export function clearPricingBulkClientIntent(storageKey: string | null | undefined) {
	if (storageKey) removeSessionValue(storageKey)
}
