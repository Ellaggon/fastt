import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { acceptProviderInvitation } from "@/lib/provider-invitations"
import { routes } from "@/lib/routes"

const acceptSchema = z.object({
	token: z.string().trim().min(16),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function shouldReturnHtmlRedirect(request: Request) {
	const accept = request.headers.get("accept") ?? ""
	return accept.includes("text/html")
}

function redirectAccept(request: Request, token: string, error?: string) {
	const url = new URL(routes.providerInvitationAccept(), request.url)
	url.searchParams.set("token", token)
	if (error) url.searchParams.set("error", error)
	else url.searchParams.set("result", "accepted")
	return Response.redirect(url, 303)
}

function redirectSignIn(request: Request, token: string) {
	const acceptPath = `${routes.providerInvitationAccept()}?token=${encodeURIComponent(token)}`
	const url = new URL("/SignInPage", request.url)
	url.searchParams.set("returnTo", acceptPath)
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const form = await request.formData()
		const parsed = acceptSchema.parse({ token: form.get("token") })
		const user = await getUserFromRequest(request)
		if (!user?.id) {
			return shouldReturnHtmlRedirect(request)
				? redirectSignIn(request, parsed.token)
				: json({ error: "unauthorized" }, 401)
		}

		const accepted = await acceptProviderInvitation({
			token: parsed.token,
			actorUserId: user.id,
			actorEmail: user.email,
		})

		return shouldReturnHtmlRedirect(request)
			? Response.redirect(
					new URL(`${routes.providerSettingsTeam()}?result=joined`, request.url),
					303
				)
			: json({ ok: true, ...accepted })
	} catch (err: any) {
		if (err instanceof Response) return err
		const token = String(
			(
				await request
					.clone()
					.formData()
					.catch(() => new FormData())
			).get("token") ?? ""
		)
		const code =
			err instanceof ZodError ? "validation_error" : String(err?.message || "accept_failed")
		const status = Number(err?.status) || (err instanceof ZodError ? 400 : 400)
		return shouldReturnHtmlRedirect(request) && token
			? redirectAccept(request, token, code)
			: json({ error: code }, status)
	}
}
