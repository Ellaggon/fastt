import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import {
	PROFESSIONAL_MODE_COOKIE,
	type ProfessionalModeCookieValue,
} from "@/lib/dashboard/professionalModeCookie"
import { setProviderProfessionalToolsPreference } from "@/lib/providerProfessionalToolsPreference"

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
		enabled:
			mode === "professional" ||
			formData.get("enabled") === "true" ||
			formData.get("professionalToolsEnabled") === "on",
	}
}

export const POST: APIRoute = async ({ request, cookies }) => {
	let returnTo: unknown = null
	let enabled = false
	let contentType = request.headers.get("content-type") ?? ""
	try {
		const parsed = await readPreferenceRequest(request)
		enabled = parsed.enabled
		returnTo = parsed.returnTo
		contentType = parsed.contentType

		cookies.set(PROFESSIONAL_MODE_COOKIE, modeFromEnabled(enabled), {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: 60 * 60 * 24 * 365,
		})

		let persisted: "database" | "cookie" = "cookie"
		let preferences: {
			providerId: string
			professionalToolsEnabled: boolean
			updatedAt: Date | null
			updatedBy: string | null
		} = {
			providerId: "",
			professionalToolsEnabled: enabled,
			updatedAt: null,
			updatedBy: null,
		}

		try {
			const { user, providerId } = await requireProvider(request)
			preferences = await setProviderProfessionalToolsPreference({
				providerId,
				actorUserId: user.id,
				enabled,
			})
			persisted = "database"
		} catch (error) {
			void error
			preferences = {
				...preferences,
				professionalToolsEnabled: enabled,
				updatedAt: null,
			}
		}

		if (contentType.includes("application/json")) {
			return new Response(JSON.stringify({ ok: true, preferences, persisted }), {
				headers: { "Content-Type": "application/json" },
			})
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
