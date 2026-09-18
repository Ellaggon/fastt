import type { APIRoute } from "astro"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { routes } from "@/lib/routes"
import { resolveProviderOnboardingNext } from "@/lib/onboarding/providerOnboarding"
import {
	createProviderFormFlash,
	PROVIDER_FORM_FLASH_COOKIE,
	type ProviderFormFlash,
} from "@/lib/provider-form-flash"
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

function writeIdentityFlash(
	cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void },
	flash: ProviderFormFlash | null,
	errors: Record<string, string>
) {
	if (!flash) return
	cookies.set(PROVIDER_FORM_FLASH_COOKIE, createProviderFormFlash({ ...flash, errors }), {
		httpOnly: true,
		sameSite: "lax",
		secure: import.meta.env.PROD,
		path: "/provider",
		maxAge: 600,
	})
}

export const GET: APIRoute = async ({ request }) => {
	return Response.redirect(new URL(routes.providerOnboardingStart(), request.url), 303)
}

export const POST: APIRoute = async ({ request, cookies }) => {
	let onboardingNext: unknown = ""
	let identityFlash: ProviderFormFlash | null = null
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
		const raw = {
			legalName: String(form.get("legalName") ?? "").trim() || undefined,
			displayName: String(form.get("displayName") ?? "").trim() || undefined,
		}
		identityFlash = {
			form: "identity",
			values: {
				displayName: String(form.get("displayName") ?? "").trim(),
				legalName: String(form.get("legalName") ?? "").trim(),
				holderType: String(form.get("holderType") ?? "").trim(),
				holderCountry: String(form.get("holderCountry") ?? "").trim(),
				taxResidenceCountry: String(form.get("taxResidenceCountry") ?? "").trim(),
				payoutCountry: String(form.get("payoutCountry") ?? "").trim(),
			},
			errors: {},
		}
		const holderDeclaration = parseHolderDeclaration(form)
		if (holderDeclaration) await assertHolderStorageAvailable()

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
				writeIdentityFlash(cookies, identityFlash, {
					holderType: "Selecciona un titular y un país válidos.",
					holderCountry: "Selecciona un titular y un país válidos.",
				})
				return redirectAfterProviderSave(request, { error: "validation_error" }, onboardingNext)
			}
			return new Response(JSON.stringify({ error: "validation_error", field: "holderType" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (e instanceof ValidationError) {
			if (shouldReturnHtmlRedirect(request)) {
				writeIdentityFlash(cookies, identityFlash, e.errors)
				return redirectAfterProviderSave(request, { error: "validation_error" }, onboardingNext)
			}
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (shouldReturnHtmlRedirect(request)) {
			writeIdentityFlash(cookies, identityFlash, {})
			return redirectAfterProviderSave(request, { error: "save_failed" }, onboardingNext)
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
