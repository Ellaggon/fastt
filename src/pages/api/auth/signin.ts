import type { APIRoute } from "astro"
import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"
import { sanitizeReturnTo } from "@/lib/auth/returnTo"
import { signInWithPassword } from "@/lib/auth/supabaseClient"

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	const email = String(form.get("email") || "").trim()
	const password = String(form.get("password") || "")
	const returnTo = sanitizeReturnTo(form.get("returnTo"), "/dashboard")

	if (!email || !password) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/SignInPage?error=missing_fields" },
		})
	}

	const result = await signInWithPassword({ email, password })
	if (!result.ok) {
		const error = result.status >= 500 ? "auth_unavailable" : "invalid_credentials"
		const params = new URLSearchParams({ error })
		if (returnTo !== "/dashboard") params.set("returnTo", returnTo)
		return new Response(null, {
			status: 302,
			headers: { Location: `/SignInPage?${params.toString()}` },
		})
	}

	const headers = new Headers()
	for (const c of buildAuthCookieHeaders(result.session)) headers.append("Set-Cookie", c)
	headers.set("Location", returnTo)

	return new Response(null, { status: 302, headers })
}
