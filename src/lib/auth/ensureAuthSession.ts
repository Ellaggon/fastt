import { shouldRefreshAccessToken } from "./accessTokenLifetime"
import { buildAuthCookieHeaders, readRefreshTokenFromRequest } from "./authCookies"
import { setRequestAuthAccessToken } from "./requestAuthState"
import { getAccessTokenFromRequest } from "./getUserFromRequest"
import { refreshSessionWithToken } from "./supabaseClient"

export async function ensureAuthSessionForRequest(request: Request): Promise<string[] | null> {
	if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null

	const accessToken = getAccessTokenFromRequest(request)
	const refreshToken = readRefreshTokenFromRequest(request)
	if (!refreshToken) return null
	if (accessToken && !shouldRefreshAccessToken(accessToken)) return null

	const refreshed = await refreshSessionWithToken(refreshToken)
	if (!refreshed.ok) return null

	setRequestAuthAccessToken(request, refreshed.session.access_token)
	return buildAuthCookieHeaders(refreshed.session)
}
