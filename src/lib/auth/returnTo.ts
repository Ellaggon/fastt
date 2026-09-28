/**
 * Only allow same-origin relative paths (open-redirect safe).
 */
export function sanitizeReturnTo(value: unknown, fallback = "/dashboard"): string {
	const raw = String(value ?? "").trim()
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
		return fallback
	}
	return raw
}

const RATE_PLAN_PLAYBOOKS = new Set(["launch-tour", "complete-to-publish"])

/** Conditions-step return inside a tour playbook. Rejects external and unrelated paths. */
export function safeRatePlanPlaybookReturn(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null
	let target: URL
	try {
		target = new URL(raw, "http://fastt.local")
	} catch {
		return null
	}
	if (target.origin !== "http://fastt.local") return null
	if (!/^\/rates\/plans\/[^/]+$/.test(target.pathname)) return null
	const playbook = String(target.searchParams.get("playbook") ?? "").trim()
	if (!RATE_PLAN_PLAYBOOKS.has(playbook)) return null
	if (!String(target.searchParams.get("productId") ?? "").trim()) return null
	return `${target.pathname}${target.search}`
}

/** A document detour may return to the owned product preview, never to an arbitrary provider route. */
export function safeProductPreviewReturn(value: unknown): string | null {
	const raw = String(value ?? "").trim()
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return null
	let target: URL
	try {
		target = new URL(raw, "http://fastt.local")
	} catch {
		return null
	}
	if (target.origin !== "http://fastt.local") return null
	if (!/^\/product\/[^/]+\/preview$/.test(target.pathname)) return null
	return `${target.pathname}${target.search}${target.hash}`
}
