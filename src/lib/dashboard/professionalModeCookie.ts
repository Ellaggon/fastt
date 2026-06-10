import { parse as parseCookie } from "cookie"

export const PROFESSIONAL_MODE_COOKIE = "fastt_workspace_mode"

export type ProfessionalModeCookieValue = "simple" | "professional"

export function normalizeProfessionalModeCookieValue(
	value: unknown
): ProfessionalModeCookieValue | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
	if (normalized === "simple" || normalized === "professional") return normalized
	return null
}

export function getProfessionalModeCookiePreference(request: Request): boolean | null {
	const raw = request.headers.get("cookie")
	if (!raw) return null
	const parsed = parseCookie(raw)
	const mode = normalizeProfessionalModeCookieValue(parsed[PROFESSIONAL_MODE_COOKIE])
	if (!mode) return null
	return mode === "professional"
}
