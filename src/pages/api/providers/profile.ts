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

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

function redirectToProfileSettings(request: Request, params: Record<string, string>): Response {
	const url = new URL(routes.providerSettingsProfile(), request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
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

export const handleProviderProfilePost: APIRoute = async ({ request }) => {
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
		const raw = {
			timezone: String(form.get("timezone") ?? "").trim(),
			defaultCurrency: String(form.get("defaultCurrency") ?? "").trim(),
			supportEmail: String(form.get("supportEmail") ?? "").trim() || undefined,
			supportPhone: String(form.get("supportPhone") ?? "").trim() || undefined,
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
			return redirectToProfileSettings(request, { success: "ops_saved" })
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ValidationError) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectToProfileSettings(request, { error: "validation_error" })
			}
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		if (shouldReturnHtmlRedirect(request)) {
			return redirectToProfileSettings(request, {
				error: msg.includes("Provider not found") ? "provider_not_found" : "save_failed",
			})
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
