import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import {
	PROFESSIONAL_MODE_COOKIE,
	type ProfessionalModeCookieValue,
} from "@/lib/dashboard/professionalModeCookie"
import {
	isMissingProfessionalToolsPreferenceShape,
	setProviderProfessionalToolsPreference,
} from "@/lib/providerProfessionalToolsPreference"

function safeReturnPath(value: unknown): string {
	const candidate = String(value ?? "").trim()
	if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/provider"
	return candidate
}

function redirectAfterSave(request: Request, status: "saved" | "error", returnTo?: unknown) {
	const url = new URL(safeReturnPath(returnTo), request.url)
	url.searchParams.set("professionalTools", status)
	return Response.redirect(url, 303)
}

function modeFromEnabled(enabled: boolean): ProfessionalModeCookieValue {
	return enabled ? "professional" : "simple"
}

export const POST: APIRoute = async ({ request, cookies }) => {
	let returnTo: unknown = null
	let enabled = false
	try {
		const { user, providerId } = await requireProvider(request)
		const contentType = request.headers.get("content-type") ?? ""
		if (contentType.includes("application/json")) {
			const body = (await request.json().catch(() => ({}))) as {
				enabled?: unknown
				mode?: unknown
				returnTo?: unknown
			}
			const mode = String(body.mode ?? "").trim()
			returnTo = body.returnTo
			enabled =
				mode === "professional" ||
				body.enabled === true ||
				body.enabled === "true" ||
				body.enabled === 1
		} else {
			const formData = await request.formData()
			const mode = String(formData.get("mode") ?? "").trim()
			enabled =
				mode === "professional" ||
				formData.get("enabled") === "true" ||
				formData.get("professionalToolsEnabled") === "on"
			returnTo = formData.get("returnTo")
		}

		cookies.set(PROFESSIONAL_MODE_COOKIE, modeFromEnabled(enabled), {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: 60 * 60 * 24 * 365,
		})

		let persisted: "database" | "cookie" = "database"
		let preferences = null
		try {
			preferences = await setProviderProfessionalToolsPreference({
				providerId,
				actorUserId: user.id,
				enabled,
			})
		} catch (error) {
			if (
				!isMissingProfessionalToolsPreferenceShape(error) &&
				process.env.LOCAL_QA_AUTH_ENABLED !== "true"
			) {
				throw error
			}
			persisted = "cookie"
			preferences = {
				providerId,
				professionalToolsEnabled: enabled,
				updatedAt: null,
				updatedBy: user.id,
			}
		}

		if (contentType.includes("application/json")) {
			return new Response(JSON.stringify({ ok: true, preferences, persisted }), {
				headers: { "Content-Type": "application/json" },
			})
		}
		return redirectAfterSave(request, "saved", returnTo)
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
		return redirectAfterSave(request, "error", returnTo)
	}
}
