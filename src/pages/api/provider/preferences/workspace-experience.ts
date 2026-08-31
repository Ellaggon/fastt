import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { setProviderUserWorkspaceExperience } from "@/lib/providerUserWorkspacePreference"

function safeReturnPath(value: unknown): string {
	const candidate = String(value ?? "").trim()
	if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/provider/settings"
	return candidate
}

function redirectAfterSave(request: Request, status: "saved" | "error", returnTo?: unknown) {
	const url = new URL(safeReturnPath(returnTo), request.url)
	url.searchParams.set("workspaceExperience", status)
	return Response.redirect(url, 303)
}

async function readPreferenceRequest(request: Request): Promise<{
	enabled: boolean
	returnTo: unknown
	contentType: string
}> {
	const contentType = request.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => ({}))) as {
			enabled?: unknown
			mode?: unknown
			returnTo?: unknown
		}
		const mode = String(body.mode ?? "").trim()
		return {
			contentType,
			returnTo: body.returnTo,
			enabled:
				mode === "professional" ||
				body.enabled === true ||
				body.enabled === "true" ||
				body.enabled === 1,
		}
	}

	const formData = await request.formData()
	const mode = String(formData.get("mode") ?? "").trim()
	return {
		contentType,
		returnTo: formData.get("returnTo"),
		enabled: mode === "professional" || formData.get("enabled") === "true",
	}
}

export const POST: APIRoute = async ({ request }) => {
	let returnTo: unknown = null
	let enabled = false
	let contentType = request.headers.get("content-type") ?? ""
	try {
		const parsed = await readPreferenceRequest(request)
		enabled = parsed.enabled
		returnTo = parsed.returnTo
		contentType = parsed.contentType

		const { user, providerId } = await requireProvider(request)
		const preferences = await setProviderUserWorkspaceExperience({
			providerId,
			userId: user.id,
			experience: enabled ? "professional" : "essential",
		})

		if (contentType.includes("application/json")) {
			return new Response(
				JSON.stringify({ ok: true, preferences, persisted: "member_preference" }),
				{
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		return redirectAfterSave(request, "saved", returnTo)
	} catch (error) {
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
		return redirectAfterSave(request, "error", returnTo)
	}
}
