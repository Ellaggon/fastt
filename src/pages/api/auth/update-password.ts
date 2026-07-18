import type { APIRoute } from "astro"
import { updatePassword } from "@/lib/auth/supabaseClient"

function getAccessToken(request: Request): string {
	const cookie = request.headers.get("cookie") || ""
	const match = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
	return match ? decodeURIComponent(match[1]) : ""
}

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	const password = String(form.get("password") || "")
	const confirmPassword = String(form.get("confirmPassword") || "")

	if (!password || !confirmPassword) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/auth/reset-password?error=missing_fields" },
		})
	}

	if (password !== confirmPassword) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/auth/reset-password?error=password_mismatch" },
		})
	}

	if (password.length < 6) {
		return new Response(null, {
			status: 302,
			headers: { Location: "/auth/reset-password?error=password_too_short" },
		})
	}

	const accessToken = getAccessToken(request)
	const result = await updatePassword({ accessToken, password })

	if (!result.ok) {
		console.error(
			JSON.stringify({
				type: "auth_update_password_failed",
				status: result.status,
				error: result.error,
			})
		)

		return new Response(null, {
			status: 302,
			headers: { Location: "/auth/reset-password?error=update_failed" },
		})
	}

	return new Response(null, {
		status: 302,
		headers: { Location: "/SignInPage?message=password_updated" },
	})
}
