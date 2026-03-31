import type { PolicyCachePort } from "../../application/ports/PolicyCachePort"

// Single cache implementation for policy resolution results.
// Key format is centralized here so invalidation/behavior is predictable.
export class PolicyCache<TValue> implements PolicyCachePort<TValue> {
	private cache = new Map<string, TValue>()

	get(params: unknown): TValue | undefined {
		return this.cache.get(this.makeKey(params as any))
	}

	set(params: unknown, value: TValue): void {
		this.cache.set(this.makeKey(params as any), value)
	}

	clearAll(): void {
		this.cache.clear()
	}

	private makeKey(params: {
		productId?: string | null
		variantId?: string | null
		channel?: string | null
		category?: string | null
		arrivalDate?: string | null
		includeCancellation?: boolean
		includeRules?: boolean
	}) {
		// Preserve the legacy cache key shape (pipe-separated) to keep hit rates stable.
		// NOTE: "hotel" scope was removed (CAPA 6). Policy resolution must no longer depend on it.
		const productId = params.productId ?? ""
		const variantId = params.variantId ?? ""
		const channel = params.channel ?? ""
		const category = params.category ?? ""
		const arrivalDate = params.arrivalDate ?? ""
		const includeCancellation = Boolean(params.includeCancellation)
		const includeRules = Boolean(params.includeRules)

		return `${productId}|${variantId}|${channel}|${category}|${arrivalDate}|${includeCancellation}|${includeRules}`
	}
}
