import type { APIRoute } from "astro"
import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"
import { signUp } from "@/lib/auth/supabaseClient"

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

	// Ensure email confirmation redirects back to a page that can persist session into httpOnly cookies.
	const origin = new URL(request.url).origin
	const redirectTo = `${origin}/auth/callback`

	const result = await signUp({ email, password, redirectTo })
	if (!result.ok) {
		return new Response(null, {
			status: 302,
			headers: { Location: `/SignInPage?error=signup_failed` },
		})
	}

	// If email confirmation is enabled, Supabase may return no session.
	if (!result.session) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/SignInPage?message=check_email" },
		})
	}

	const headers = new Headers()
	for (const c of buildAuthCookieHeaders(result.session)) headers.append("Set-Cookie", c)
	headers.set("Location", "/dashboard")

	return new Response(null, { status: 302, headers })
}
