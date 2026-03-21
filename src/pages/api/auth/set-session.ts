import type { APIRoute } from "astro"
import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"

type Body = {
	access_token?: unknown
	refresh_token?: unknown
	expires_in?: unknown
}

export const POST: APIRoute = async ({ request }) => {
	try {
		let body: Body = {}
		try {
			body = (await request.json()) as Body
		} catch {
			return new Response(JSON.stringify({ error: "Invalid JSON" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const access_token = typeof body.access_token === "string" ? body.access_token : ""
		const refresh_token = typeof body.refresh_token === "string" ? body.refresh_token : ""
		const expires_in =
			typeof body.expires_in === "number"
				? body.expires_in
				: typeof body.expires_in === "string"
					? Number(body.expires_in)
					: NaN

		if (!access_token || !refresh_token || !Number.isFinite(expires_in) || expires_in <= 0) {
			return new Response(JSON.stringify({ error: "Invalid token payload" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const headers = new Headers()
		for (const c of buildAuthCookieHeaders({
			access_token,
			refresh_token,
			expires_in,
			token_type: "bearer",
		})) {
			headers.append("Set-Cookie", c)
		}
		headers.set("Content-Type", "application/json")
		headers.set("Cache-Control", "no-store")

		// This endpoint is designed for XHR/fetch from /auth/callback.
		// The client performs the final redirect to /dashboard.
		return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
	} catch (e) {
		console.error("/api/auth/set-session error:", e)
		return new Response(JSON.stringify({ error: "Server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
