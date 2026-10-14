const paths = new Set([
	"/financial",
	"/financial/collections",
	"/financial/settlements",
	"/financial/provider-payables",
	"/financial/refunds",
	"/financial/exceptions",
])
/** A financial detour returns to a known page, never an external URL or arbitrary route. */
export function safeFinancialReturn(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null
	try {
		const target = new URL(raw, "http://fastt.local")
		if (target.origin !== "http://fastt.local" || !paths.has(target.pathname)) return null
		const params = new URLSearchParams()
		for (const key of ["scope", "productId", "segment", "age", "search", "actor"]) {
			const v = target.searchParams.get(key)
			if (v) params.set(key, v)
		}
		return target.pathname + (params.size ? `?${params}` : "")
	} catch {
		return null
	}
}
