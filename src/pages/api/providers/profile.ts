import type { APIRoute } from "astro"
import { first, db, eq, ProviderProfile } from "@/shared/infrastructure/db/compat"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { providerV2Repository } from "@/container"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"
import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { routes } from "@/lib/routes"
import {
	resolveProviderOnboardingErrorReturn,
	resolveProviderOnboardingNext,
} from "@/lib/onboarding/providerOnboarding"
import {
	createProviderFormFlash,
	PROVIDER_FORM_FLASH_COOKIE,
	type ProviderFormFlash,
} from "@/lib/provider-form-flash"
import {
	formIncludesIdentityFields,
	persistProviderIdentityFromForm,
	readProviderSettingsFormValues,
	validateProviderSettingsForm,
} from "@/lib/provider/save-provider-settings-profile"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

function redirectToProfileSettings(request: Request, params: Record<string, string>): Response {
	const url = new URL(routes.providerSettingsProfile(), request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

function redirectAfterProfileSave(
	request: Request,
	params: Record<string, string>,
	onboardingNext: unknown
): Response {
	const target = resolveProviderOnboardingNext(onboardingNext, routes.providerSettingsProfile())
	const url = new URL(target, request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

function redirectAfterProfileError(
	request: Request,
	params: Record<string, string>,
	onboardingNext: unknown
): Response {
	const target = resolveProviderOnboardingErrorReturn(
		onboardingNext,
		routes.providerSettingsProfile()
	)
	const url = new URL(target, request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

function writeProfileFlash(
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

function profileSnapshot(
	row: {
		timezone: string
		defaultCurrency: string
		supportEmail: string | null
		supportPhone: string | null
	} | null
) {
	if (!row) return null
	return {
		timezone: row.timezone,
		defaultCurrency: row.defaultCurrency,
		supportEmail: row.supportEmail,
		supportPhone: row.supportPhone,
	}
}

export const handleProviderProfilePost: APIRoute = async ({ request, cookies }) => {
	let onboardingNext: unknown = ""
	let profileFlash: ProviderFormFlash | null = null
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email || !user?.id) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectToProfileSettings(request, { error: "session_expired" })
			}
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectToProfileSettings(request, { error: "provider_not_found" })
			}
			return new Response(JSON.stringify({ error: "Provider not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		onboardingNext = form.get("onboardingNext")
		const includeIdentity = formIncludesIdentityFields(form)
		const values = readProviderSettingsFormValues(form)
		const raw = {
			timezone: values.timezone,
			defaultCurrency: values.defaultCurrency,
			supportEmail: values.supportEmail,
			supportPhone: values.supportPhone || undefined,
		}
		profileFlash = {
			form: includeIdentity ? "settings" : "profile",
			values: includeIdentity ? values : { ...raw, supportPhone: raw.supportPhone ?? "" },
			errors: {},
		}

		const settingsErrors = validateProviderSettingsForm(form, { includeIdentity })
		if (Object.keys(settingsErrors).length > 0) {
			throw new ValidationError(settingsErrors)
		}

		if (includeIdentity) {
			await persistProviderIdentityFromForm({
				repo: providerV2Repository,
				providerId,
				userId: user.id,
				form,
			})
			await invalidateProviderGovernance(providerId, "provider_identity_updated")
		}

		const beforeProfile = profileSnapshot(
			(await db
				.select({
					timezone: ProviderProfile.timezone,
					defaultCurrency: ProviderProfile.defaultCurrency,
					supportEmail: ProviderProfile.supportEmail,
					supportPhone: ProviderProfile.supportPhone,
				})
				.from(ProviderProfile)
				.where(eq(ProviderProfile.providerId, providerId))
				.then(first)
				.catch(() => null)) ?? null
		)

		const result = await upsertProviderProfileV2(
			{ repo: providerV2Repository },
			{
				providerId,
				timezone: raw.timezone,
				defaultCurrency: raw.defaultCurrency,
				supportEmail: raw.supportEmail,
				supportPhone: raw.supportPhone,
			}
		)
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_profile_updated")

		await writeProviderAuditLog({
			providerId,
			actorUserId: user.id,
			action: "provider.profile.upsert",
			entityType: "ProviderProfile",
			entityId: providerId,
			beforeJson: beforeProfile,
			afterJson: {
				timezone: raw.timezone,
				defaultCurrency: raw.defaultCurrency,
				supportEmail: raw.supportEmail ?? null,
				supportPhone: raw.supportPhone ?? null,
			},
			riskLevel: inferSettingsRiskLevel({
				domain: "profile",
				changedKeys: Object.keys(raw),
			}),
		})

		if (shouldReturnHtmlRedirect(request)) {
			return redirectAfterProfileSave(
				request,
				{ success: includeIdentity ? "saved" : "ops_saved" },
				onboardingNext
			)
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ValidationError) {
			if (shouldReturnHtmlRedirect(request)) {
				writeProfileFlash(cookies, profileFlash, e.errors)
				return redirectAfterProfileError(request, { error: "validation_error" }, onboardingNext)
			}
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		if (shouldReturnHtmlRedirect(request)) {
			writeProfileFlash(cookies, profileFlash, {})
			return redirectAfterProfileError(
				request,
				{
					error: msg.includes("Provider not found") ? "provider_not_found" : "save_failed",
				},
				onboardingNext
			)
		}
		const status = msg.includes("Provider not found") ? 404 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const POST: APIRoute = handleProviderProfilePost
export const PATCH: APIRoute = handleProviderProfilePost
