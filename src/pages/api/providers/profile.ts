import type { APIRoute } from "astro"
import { db, ProviderAuditLog } from "astro:db"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { providerV2Repository } from "@/container"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

export const handleProviderProfilePost: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
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
			taxResidenceCountry:
				String(form.get("taxResidenceCountry") ?? "")
					.trim()
					.toUpperCase() || undefined,
			businessRegistrationNumber:
				String(form.get("businessRegistrationNumber") ?? "").trim() || undefined,
			fiscalStatus: String(form.get("fiscalStatus") ?? "").trim() || undefined,
			paymentReadinessStatus: String(form.get("paymentReadinessStatus") ?? "").trim() || undefined,
			integrationReadinessStatus:
				String(form.get("integrationReadinessStatus") ?? "").trim() || undefined,
		}

		const result = await upsertProviderProfileV2(
			{ repo: providerV2Repository },
			{ providerId, ...raw }
		)
		await invalidateProvider(providerId)
		await db
			.insert(ProviderAuditLog)
			.values({
				id: crypto.randomUUID(),
				providerId,
				actorUserId: user.id,
				action: "provider.profile.upsert",
				entityType: "ProviderProfile",
				entityId: providerId,
				afterJson: raw,
				riskLevel:
					raw.fiscalStatus || raw.paymentReadinessStatus || raw.integrationReadinessStatus
						? "medium"
						: "low",
				createdAt: new Date(),
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error)
				if (!message.includes("ProviderAuditLog") && !message.includes("no such table")) {
					throw error
				}
			})

		if (shouldReturnHtmlRedirect(request)) {
			const url = new URL("/provider/settings/profile?success=saved", request.url)
			return Response.redirect(url, 303)
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		const status = msg.includes("Provider not found") ? 404 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const POST: APIRoute = handleProviderProfilePost
export const PATCH: APIRoute = handleProviderProfilePost
