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
	operations: "/api/internal/financial/operations?limit=25",
	exceptions: "/api/internal/financial/exceptions?status=all&limit=50",
	reviewEvents: "/api/internal/financial/review-events?limit=50",
	references: "/api/internal/financial/references?limit=100",
	refundHandoffs: "/api/internal/financial/refund-handoffs?status=all&limit=100",
	reconciliationQueue: "/api/internal/financial/reconciliation-queue?limit=50",
	providerFinance: "/api/internal/financial/provider-finance?limit=25",
} as const

export type FinancialDataSource = keyof typeof financialEndpointUrls

export const financialDataSourceUrls = financialEndpointUrls

export type FinancialPagination = {
	limit?: number
	returned?: number
	hasMore?: boolean
	nextCursor?: string | null
}

export function financialUrlWithParams(
	url: string,
	params: Record<string, string | number | null | undefined>
): string {
	const [pathname, query = ""] = url.split("?")
	const search = new URLSearchParams(query)
	for (const [key, value] of Object.entries(params)) {
		if (value == null || value === "") search.delete(key)
		else search.set(key, String(value))
	}
	const serialized = search.toString()
	return serialized ? `${pathname}?${serialized}` : pathname
}

export function financialUrlWithCursor(
	url: string,
	params: { limit?: number; cursor?: string | null }
): string {
	return financialUrlWithParams(url, {
		limit: params.limit,
		cursor: params.cursor || null,
	})
}

export function mergeFinancialPayloadById<T extends { items?: any[] }>(
	current: T | null | undefined,
	next: T,
	idForItem: (item: any) => string = (item) => String(item?.id || item?.bookingId || "")
): T {
	const mergedItems: any[] = []
	const seen = new Set<string>()
	for (const item of [
		...(Array.isArray(current?.items) ? current.items : []),
		...(Array.isArray(next?.items) ? next.items : []),
	]) {
		const key = idForItem(item) || JSON.stringify(item)
		if (seen.has(key)) continue
		seen.add(key)
		mergedItems.push(item)
	}
	return {
		...(current || ({} as T)),
		...next,
		items: mergedItems,
	} as T
}

export const financialRouteEndpointMap: Record<string, string[]> = {
	"/financial": [
		financialEndpointUrls.operations,
		financialEndpointUrls.exceptions,
		financialEndpointUrls.reviewEvents,
		financialEndpointUrls.references,
		financialEndpointUrls.refundHandoffs,
	],
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
