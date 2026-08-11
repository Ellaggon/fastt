import type { APIRoute } from "astro"
import { buildClearAuthCookieHeaders, buildLocalQaLogoutCookie } from "@/lib/auth/authCookies"
import { sanitizeReturnTo } from "@/lib/auth/returnTo"

export const GET: APIRoute = async ({ request }) => {
	// IMPORTANT: do NOT collapse headers into a plain object.
	// Multiple `Set-Cookie` headers must be preserved as separate header entries.
	const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"), "/")
	const headers = new Headers({ Location: returnTo })
	for (const c of buildClearAuthCookieHeaders()) headers.append("Set-Cookie", c)
	headers.append("Set-Cookie", buildLocalQaLogoutCookie())

	return new Response(null, {
		status: 302,
		headers,
	})
}
