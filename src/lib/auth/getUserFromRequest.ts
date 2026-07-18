import { parse as parseCookie } from "cookie"
import { createHash } from "node:crypto"
import { db, sql, User } from "astro:db"
import { LOCAL_QA_LOGOUT_COOKIE } from "./authCookies"
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

function hashToken(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

export function getSessionIdFromRequest(request: Request): string | null {
	const token = readBearerToken(request) || readCookieToken(request)
	if (!token) return null
	return hashToken(token)
}

export function isLocalQaAuthLoggedOut(request: Request): boolean {
	const raw = request.headers.get("cookie")
	if (!raw) return false
	const c = parseCookie(raw)
	return c[LOCAL_QA_LOGOUT_COOKIE] === "true"
}

function getLocalQaUser(request: Request): AuthUser | null {
	if (process.env.NODE_ENV === "production") return null
	if (process.env.LOCAL_QA_AUTH_ENABLED !== "true") return null
	if (isLocalQaAuthLoggedOut(request)) return null
	const id = String(process.env.LOCAL_QA_AUTH_USER_ID ?? "").trim()
	const email = String(process.env.LOCAL_QA_AUTH_EMAIL ?? "")
		.trim()
		.toLowerCase()
	if (!id || !email) return null
	return { id, email }
}

/**
 * Reads the access token from Authorization header or cookies and validates it with Supabase.
 */
export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
	const localQaUser = getLocalQaUser(request)
	if (localQaUser) return localQaUser

	const token = readBearerToken(request) || readCookieToken(request)

	// Supabase configured: validate token against Supabase.
	if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
		if (!token) return null
		const u = await fetchSupabaseUser(token)
		if (!u?.id || !u.email) return null
		const email = String(u.email).trim().toLowerCase()
		if (!email) return null

		try {
			const existing = await db
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${email}`)
				.get()
			if (existing?.id) return { id: existing.id, email }

			await db.insert(User).values({ id: u.id, email }).onConflictDoNothing()
			const persisted = await db
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${email}`)
				.get()
			if (persisted?.id) return { id: persisted.id, email }
		} catch {
			// Keep auth non-blocking even if persistence sync fails.
		}
		return { id: u.id, email }
	}

	return null
}
