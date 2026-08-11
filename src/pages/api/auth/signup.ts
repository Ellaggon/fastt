import type { APIRoute } from "astro"
import { buildAuthCookieHeaders } from "@/lib/auth/authCookies"
import { sanitizeReturnTo } from "@/lib/auth/returnTo"
import { signUp } from "@/lib/auth/supabaseClient"

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

	// Ensure email confirmation redirects back to a page that can persist session into httpOnly cookies.
	const origin = new URL(request.url).origin
	const callbackUrl = new URL("/auth/callback", origin)
	if (returnTo !== "/dashboard") callbackUrl.searchParams.set("returnTo", returnTo)
	const redirectTo = callbackUrl.toString()

	const result = await signUp({ email, password, redirectTo })
	if (!result.ok) {
		console.error(
			JSON.stringify({
				type: "auth_signup_failed",
				email,
				status: result.status,
				error: result.error,
			})
		)

		return new Response(
			JSON.stringify({
				error: "signup_failed",
				providerError: result.error,
				providerStatus: result.status,
			}),
			{
				status: result.status >= 400 ? result.status : 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	// If email confirmation is enabled, Supabase may return no session.
	if (!result.session) {
		const params = new URLSearchParams({ message: "check_email" })
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
