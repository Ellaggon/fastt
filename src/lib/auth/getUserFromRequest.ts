import { parse as parseCookie } from "cookie"
import { createHash } from "node:crypto"
import { first, db, sql, User } from "@/shared/infrastructure/db/compat"
import { LOCAL_QA_LOGOUT_COOKIE } from "./authCookies"
import { getCachedAuthUser, setCachedAuthUser } from "./authCache"
import { fetchSupabaseUser } from "./supabaseClient"

export type AuthUser = { id: string; email: string }

const LOCAL_QA_CACHE_TTL_MS = 30_000
let localQaUserCache: { key: string; user: AuthUser; expiresAt: number } | null = null

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

function readLocalQaEnvUser(): AuthUser | null {
	if (process.env.NODE_ENV === "production") return null
	if (process.env.LOCAL_QA_AUTH_ENABLED !== "true") return null
	const id = String(process.env.LOCAL_QA_AUTH_USER_ID ?? "").trim()
	const email = String(process.env.LOCAL_QA_AUTH_EMAIL ?? "")
		.trim()
		.toLowerCase()
	if (!id || !email) return null
	return { id, email }
}

/**
 * Local QA auth must resolve to a real User row when possible.
 * Env user ids like `qa-user-…` often lack a ProviderUser link, which makes
 * document/payment asserts fail with `forbidden` while the UI still shows owner.
 */
export async function resolveLocalQaAuthUser(request: Request): Promise<AuthUser | null> {
	if (isLocalQaAuthLoggedOut(request)) return null
	const envUser = readLocalQaEnvUser()
	if (!envUser) return null
	const cacheKey = `${envUser.id}:${envUser.email}`
	if (localQaUserCache?.key === cacheKey && localQaUserCache.expiresAt > Date.now()) {
		return localQaUserCache.user
	}
	try {
		const existing = await db
			.select({ id: User.id })
			.from(User)
			.where(sql`lower(${User.email}) = ${envUser.email}`)
			.then(first)
		if (existing?.id) {
			const user = { id: String(existing.id), email: envUser.email }
			localQaUserCache = { key: cacheKey, user, expiresAt: Date.now() + LOCAL_QA_CACHE_TTL_MS }
			return user
		}
	} catch {
		// Fall through to env id when DB is unavailable.
	}
	localQaUserCache = {
		key: cacheKey,
		user: envUser,
		expiresAt: Date.now() + LOCAL_QA_CACHE_TTL_MS,
	}
	return envUser
}

/**
 * Reads the access token from Authorization header or cookies and validates it with Supabase.
 */
export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
	const token = readBearerToken(request) || readCookieToken(request)
	const sessionId = token ? hashToken(token) : null
	// A real session must always win over the local QA fixture. Without this guard,
	// LOCAL_QA_AUTH_ENABLED silently impersonates the fixture user after sign-in.
	if (!token) {
		const localQaUser = await resolveLocalQaAuthUser(request)
		if (localQaUser) return localQaUser
	}

	// Supabase configured: validate token against Supabase.
	if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
		if (!token) return null
		const cachedUser = await getCachedAuthUser(sessionId)
		if (cachedUser) return cachedUser

		const u = await fetchSupabaseUser(token)
		if (!u?.id || !u.email) return null
		const email = String(u.email).trim().toLowerCase()
		if (!email) return null

		try {
			const existing = await db
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${email}`)
				.then(first)
			if (existing?.id) {
				const user = { id: existing.id, email }
				void setCachedAuthUser(sessionId, user).catch(() => {})
				return user
			}

			await db.insert(User).values({ id: u.id, email }).onConflictDoNothing()
			const persisted = await db
				.select({ id: User.id })
				.from(User)
				.where(sql`lower(${User.email}) = ${email}`)
				.then(first)
			if (persisted?.id) {
				const user = { id: persisted.id, email }
				void setCachedAuthUser(sessionId, user).catch(() => {})
				return user
			}
		} catch {
			// Keep auth non-blocking even if persistence sync fails.
		}
		const user = { id: u.id, email }
		void setCachedAuthUser(sessionId, user).catch(() => {})
		return user
	}

	return null
}
