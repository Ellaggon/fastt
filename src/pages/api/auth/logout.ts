import type { APIRoute } from "astro"
import { buildClearAuthCookieHeaders } from "@/lib/auth/authCookies"

export const GET: APIRoute = async () => {
	// IMPORTANT: do NOT collapse headers into a plain object.
	// Multiple `Set-Cookie` headers must be preserved as separate header entries.
	const headers = new Headers({ Location: "/" })
	for (const c of buildClearAuthCookieHeaders()) headers.append("Set-Cookie", c)

	return new Response(null, {
		status: 302,
		headers,
	})
}
