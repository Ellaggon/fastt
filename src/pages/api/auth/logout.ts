import type { APIRoute } from "astro"
import { buildClearAuthCookieHeaders } from "@/lib/auth/authCookies"

export const GET: APIRoute = async () => {
	const headers = new Headers()
	for (const c of buildClearAuthCookieHeaders()) headers.append("Set-Cookie", c)

	return new Response(null, {
		status: 302,
		headers: {
			...Object.fromEntries(headers.entries()),
			Location: "/",
		},
	})
}
