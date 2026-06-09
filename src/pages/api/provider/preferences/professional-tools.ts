import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { setProviderProfessionalToolsPreference } from "@/lib/providerProfessionalToolsPreference"

function redirectToSettings(request: Request, status: "saved" | "error") {
	const url = new URL("/provider", request.url)
	url.searchParams.set("professionalTools", status)
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, providerId } = await requireProvider(request)
		const contentType = request.headers.get("content-type") ?? ""
		let enabled = false
		if (contentType.includes("application/json")) {
			const body = (await request.json().catch(() => ({}))) as { enabled?: unknown }
			enabled = body.enabled === true || body.enabled === "true" || body.enabled === 1
		} else {
			const formData = await request.formData()
			enabled = formData.get("professionalToolsEnabled") === "on"
		}

		const preferences = await setProviderProfessionalToolsPreference({
			providerId,
			actorUserId: user.id,
			enabled,
		})

		if (contentType.includes("application/json")) {
			return new Response(JSON.stringify({ ok: true, preferences }), {
				headers: { "Content-Type": "application/json" },
			})
		}
		return redirectToSettings(request, "saved")
	} catch (error) {
		if (error instanceof Response) return error
		if ((request.headers.get("content-type") ?? "").includes("application/json")) {
			return new Response(
				JSON.stringify({
					ok: false,
					error:
						error instanceof Error
							? error.message
							: "No pudimos actualizar las herramientas profesionales.",
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } }
			)
		}
		return redirectToSettings(request, "error")
	}
}
