import { parse as parseCookie, serialize } from "cookie"
import type { SupabaseSession } from "./supabaseClient"

export const LOCAL_QA_LOGOUT_COOKIE = "fastt-local-qa-logged-out"

type CookieOpts = {
	secure: boolean
}

function baseCookieOptions(opts: CookieOpts) {
	return {
		httpOnly: true,
		secure: opts.secure,
		sameSite: "lax" as const,
		path: "/",
	}
}

function authRefreshCookieMaxAgeSeconds(): number {
	if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_PERSISTENT_SESSION === "true") {
		// Local development: keep refresh cookie until explicit sign-out.
		return 60 * 60 * 24 * 365 * 5
	}
	return 60 * 60 * 24 * 30
}

export function readRefreshTokenFromRequest(request: Request): string | null {
	const raw = request.headers.get("cookie")
	if (!raw) return null
	const cookies = parseCookie(raw)
	return cookies["sb-refresh-token"] ?? null
}

export function buildAuthCookieHeaders(session: SupabaseSession): string[] {
	const secure = process.env.NODE_ENV === "production"
	const opts = baseCookieOptions({ secure })
	const refreshMaxAge = authRefreshCookieMaxAgeSeconds()

	const access = serialize("sb-access-token", session.access_token, {
		...opts,
		maxAge: Math.max(session.expires_in, refreshMaxAge),
	})

	// Keep refresh token longer; Supabase rotates refresh tokens server-side.
	const refresh = serialize("sb-refresh-token", session.refresh_token, {
		...opts,
		maxAge: refreshMaxAge,
	})

	return [access, refresh, buildClearLocalQaLogoutCookie()]
}

export function buildClearAuthCookieHeaders(): string[] {
	const secure = process.env.NODE_ENV === "production"
	const opts = baseCookieOptions({ secure })

	return [
		serialize("sb-access-token", "", { ...opts, maxAge: 0 }),
		serialize("sb-refresh-token", "", { ...opts, maxAge: 0 }),
		serialize("sb:token", "", { ...opts, maxAge: 0 }),
		serialize("access_token", "", { ...opts, maxAge: 0 }),
		serialize("supabase_access_token", "", { ...opts, maxAge: 0 }),
	]
}

export function buildLocalQaLogoutCookie(): string {
	const secure = process.env.NODE_ENV === "production"
	return serialize(LOCAL_QA_LOGOUT_COOKIE, "true", {
		...baseCookieOptions({ secure }),
		maxAge: 60 * 60 * 24 * 30,
	})
}

export function buildClearLocalQaLogoutCookie(): string {
	const secure = process.env.NODE_ENV === "production"
	return serialize(LOCAL_QA_LOGOUT_COOKIE, "", {
		...baseCookieOptions({ secure }),
		maxAge: 0,
	})
}
