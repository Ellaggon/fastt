type CachedEntry = {
	data?: unknown
	inFlight?: Promise<unknown>
	updatedAt: number
}

type FinancialCacheStore = {
	entries: Map<string, CachedEntry>
}

const globalCache = globalThis as typeof globalThis & {
	__fasttFinancialDataCache?: FinancialCacheStore
}

const store: FinancialCacheStore =
	globalCache.__fasttFinancialDataCache ||
	(globalCache.__fasttFinancialDataCache = { entries: new Map<string, CachedEntry>() })

const headers = { accept: "application/json" }

export const financialEndpointUrls = {
	operations: "/api/internal/financial/operations",
	exceptions: "/api/internal/financial/exceptions?status=all&limit=250",
	reviewEvents: "/api/internal/financial/review-events?limit=250",
	references: "/api/internal/financial/references?limit=500",
	refundHandoffs: "/api/internal/financial/refund-handoffs?status=all&limit=500",
	reconciliationQueue: "/api/internal/financial/reconciliation-queue?limit=250",
	providerFinance: "/api/internal/financial/provider-finance",
} as const

export const financialRouteEndpointMap: Record<string, string[]> = {
	"/financial": Object.values(financialEndpointUrls),
	"/financial/collections": [financialEndpointUrls.reconciliationQueue],
	"/financial/settlements": [financialEndpointUrls.reconciliationQueue],
	"/financial/provider-payables": [financialEndpointUrls.providerFinance],
	"/financial/refunds": [financialEndpointUrls.refundHandoffs],
	"/financial/exceptions": [financialEndpointUrls.operations, financialEndpointUrls.exceptions],
}

function cacheKey(url: string): string {
	return url
}

export function getCachedFinancialJson<T = unknown>(url: string): T | null {
	const entry = store.entries.get(cacheKey(url))
	return entry?.data == null ? null : (entry.data as T)
}

export async function fetchFinancialJson<T = unknown>(
	url: string,
	options: { force?: boolean } = {}
): Promise<T> {
	const key = cacheKey(url)
	const existing = store.entries.get(key)
	if (!options.force && existing?.data != null) return existing.data as T
	if (existing?.inFlight) return existing.inFlight as Promise<T>

	const request = fetch(url, { headers }).then(async (response) => {
		if (!response.ok) throw new Error(`financial_fetch_failed:${url}`)
		const data = await response.json()
		store.entries.set(key, { data, updatedAt: Date.now() })
		return data
	})

	store.entries.set(key, {
		data: existing?.data,
		inFlight: request,
		updatedAt: existing?.updatedAt || 0,
	})

	try {
		return (await request) as T
	} catch (error) {
		if (existing?.data != null) {
			store.entries.set(key, existing)
		} else {
			store.entries.delete(key)
		}
		throw error
	}
}

export function refreshFinancialJson<T = unknown>(url: string): Promise<T> {
	return fetchFinancialJson<T>(url, { force: true })
}

export function prewarmFinancialEndpoints(urls: string[]): void {
	for (const url of urls) {
		void fetchFinancialJson(url).catch(() => {
			// Prewarm is opportunistic; visible page loaders own user-facing errors.
		})
	}
}

export function endpointsForFinancialPath(pathname: string): string[] {
	const normalized = pathname.replace(/\/$/, "") || "/"
	return financialRouteEndpointMap[normalized] || []
}
