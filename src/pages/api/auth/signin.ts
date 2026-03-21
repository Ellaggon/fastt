import type { APIRoute } from "astro"
import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"
import { signInWithPassword } from "@/lib/auth/supabaseClient"

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	const email = String(form.get("email") || "").trim()
	const password = String(form.get("password") || "")

	if (!email || !password) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/SignInPage?error=missing_fields" },
		})
	}

	const result = await signInWithPassword({ email, password })
	if (!result.ok) {
		return new Response(null, {
			status: 302,
			headers: { Location: `/SignInPage?error=invalid_credentials` },
		})
	}

	const headers = new Headers()
	for (const c of buildAuthCookieHeaders(result.session)) headers.append("Set-Cookie", c)
	headers.set("Location", "/dashboard")

	return new Response(null, { status: 302, headers })
}
