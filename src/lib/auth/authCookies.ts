import { serialize } from "cookie"
import type { SupabaseSession } from "./supabaseClient"

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

export function buildAuthCookieHeaders(session: SupabaseSession): string[] {
	const secure = process.env.NODE_ENV === "production"
	const opts = baseCookieOptions({ secure })

	const access = serialize("sb-access-token", session.access_token, {
		...opts,
		maxAge: session.expires_in,
	})

	// Keep refresh token longer; Supabase rotates refresh tokens server-side.
	const refresh = serialize("sb-refresh-token", session.refresh_token, {
		...opts,
		maxAge: 60 * 60 * 24 * 30, // 30 days
	})

	return [access, refresh]
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
