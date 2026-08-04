import type { APIRoute } from "astro"
import { getPasswordResetRedirectTo } from "@/lib/auth/passwordRecovery"
import { sendPasswordRecoveryEmail } from "@/lib/auth/supabaseClient"

function redirectToSignIn(params: Record<string, string>) {
	const query = new URLSearchParams(params)
	return new Response(null, {
		status: 302,
		headers: { Location: `/SignInPage?${query.toString()}` },
	})
}

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	const email = String(form.get("email") || "").trim()

	if (!email) {
		return redirectToSignIn({ error: "missing_email" })
	}

	let redirectTo: string
	try {
		redirectTo = getPasswordResetRedirectTo(
			request.url,
			process.env.AUTH_PASSWORD_RESET_REDIRECT_URL
		)
	} catch (error) {
		console.error(
			JSON.stringify({
				type: "auth_password_recovery_redirect_invalid",
				error: error instanceof Error ? error.message : String(error),
			})
		)
		return redirectToSignIn({ error: "recovery_unavailable" })
	}
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
