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
