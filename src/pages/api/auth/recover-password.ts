import type { APIRoute } from "astro"
import { sendPasswordRecoveryEmail } from "@/lib/auth/supabaseClient"

function redirectToSignIn(params: Record<string, string>) {
	const query = new URLSearchParams(params)
	return new Response(null, {
		status: 302,
		headers: { Location: `/SignInPage?${query.toString()}` },
	})
}

function getPasswordResetRedirectTo(request: Request, site?: URL) {
	const explicit = String(process.env.AUTH_PASSWORD_RESET_REDIRECT_URL || "").trim()
	if (explicit) return explicit

	if (site?.origin) return `${site.origin}/auth/reset-password`

	const origin = new URL(request.url).origin
	return `${origin}/auth/reset-password`
}

export const POST: APIRoute = async ({ request, site }) => {
	const form = await request.formData()
	const email = String(form.get("email") || "").trim()

	if (!email) {
		return redirectToSignIn({ error: "missing_email" })
	}

	const redirectTo = getPasswordResetRedirectTo(request, site)
	const result = await sendPasswordRecoveryEmail({ email, redirectTo })

	if (!result.ok) {
		console.error(
			JSON.stringify({
				type: "auth_password_recovery_failed",
				email,
				status: result.status,
				error: result.error,
			})
		)

		const error = result.status >= 500 ? "recovery_unavailable" : "recovery_failed"
		return redirectToSignIn({ error })
	}

	return redirectToSignIn({ message: "recovery_email_sent" })
}
