import { parse as parseCookie } from "cookie"
import { fetchSupabaseUser } from "./supabaseClient"

export type AuthUser = { id: string; email: string }

function readBearerToken(req: Request): string | null {
	const h = req.headers.get("authorization") || req.headers.get("Authorization")
	if (!h) return null
	const m = /^Bearer\s+(.+)$/.exec(h)
	return m?.[1] ?? null
}

function readCookieToken(req: Request): string | null {
	const raw = req.headers.get("cookie")
	if (!raw) return null
	const c = parseCookie(raw)

	// Common token cookie names (project may standardize later).
	return (
		c["sb-access-token"] || c["sb:token"] || c["access_token"] || c["supabase_access_token"] || null
	)
}

/**
 * Reads the access token from Authorization header or cookies and validates it with Supabase.
 */
export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
	const token = readBearerToken(request) || readCookieToken(request)

	// Supabase configured: validate token against Supabase.
	if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
		if (!token) return null
		const u = await fetchSupabaseUser(token)
		if (!u?.id || !u.email) return null
		return { id: u.id, email: u.email }
	}

	return null
}
