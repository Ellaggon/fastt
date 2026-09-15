import type { APIRoute } from "astro"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { routes } from "@/lib/routes"
import { resolveProviderOnboardingNext } from "@/lib/onboarding/providerOnboarding"
import { registerProviderV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"
import {
	assertHolderStorageAvailable,
	parseHolderDeclaration,
	saveProviderHolderProfile,
} from "@/lib/provider-holder-profile"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

function redirectToProfileSettings(request: Request, params: Record<string, string>): Response {
	const url = new URL(routes.providerSettingsProfile(), request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

function redirectAfterProviderSave(
	request: Request,
	params: Record<string, string>,
	onboardingNext: unknown
): Response {
	const target = resolveProviderOnboardingNext(onboardingNext, routes.providerSettingsProfile())
	const url = new URL(target, request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

export const GET: APIRoute = async ({ request }) => {
	return redirectToProfileSettings(request, { error: "invalid_method" })
}

export const POST: APIRoute = async ({ request }) => {
	let onboardingNext: unknown = ""
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectToProfileSettings(request, { error: "session_expired" })
			}
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		onboardingNext = form.get("onboardingNext")
		const holderDeclaration = parseHolderDeclaration(form)
		if (holderDeclaration) await assertHolderStorageAvailable()
		const raw = {
			legalName: String(form.get("legalName") ?? "").trim() || undefined,
			displayName: String(form.get("displayName") ?? "").trim() || undefined,
		}

		const result = await registerProviderV2(
			{ repo: providerV2Repository },
			{
				sessionEmail: user.email,
				...raw,
			}
		)
		if (holderDeclaration) {
			await saveProviderHolderProfile({
				providerId: result.providerId,
				userId: user.id,
				declaration: holderDeclaration,
			})
		}

		if (shouldReturnHtmlRedirect(request)) {
			return redirectAfterProviderSave(request, { success: "identity_saved" }, onboardingNext)
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof Error && e.message === "holder_declaration_invalid") {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectAfterProviderSave(request, { error: "validation_error" }, onboardingNext)
			}
			return new Response(JSON.stringify({ error: "validation_error", field: "holderType" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof ValidationError) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectAfterProviderSave(request, { error: "validation_error" }, onboardingNext)
			}
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (shouldReturnHtmlRedirect(request)) {
			return redirectAfterProviderSave(request, { error: "save_failed" }, onboardingNext)
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
