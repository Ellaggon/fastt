import type { APIRoute } from "astro"
import { providerV2Repository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { routes } from "@/lib/routes"
import { updateProviderIdentityV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

function redirectToProfileSettings(request: Request, params: Record<string, string>): Response {
	const url = new URL(routes.providerSettingsProfile(), request.url)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return Response.redirect(url, 303)
}

async function handleProviderUpdate(ctx: Parameters<APIRoute>[0]): Promise<Response> {
	const { request, params } = ctx
	void params.id

	try {
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
			legalName: String(form.get("legalName") ?? "").trim(),
			displayName: String(form.get("displayName") ?? "").trim(),
		}

		const result = await updateProviderIdentityV2(
			{ repo: providerV2Repository },
			{
				providerId,
				...raw,
			}
		)
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_identity_updated")

		if (shouldReturnHtmlRedirect(request)) {
			return redirectToProfileSettings(request, { success: "identity_saved" })
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof ValidationError) {
			if (shouldReturnHtmlRedirect(request)) {
				return redirectToProfileSettings(request, { error: "validation_error" })
			}
			return new Response(JSON.stringify({ error: "validation_error", errors: error.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (shouldReturnHtmlRedirect(request)) {
			return redirectToProfileSettings(request, { error: "save_failed" })
		}
		const message = error instanceof Error ? error.message : "Unknown error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const GET: APIRoute = async ({ request }) => {
	return redirectToProfileSettings(request, { error: "invalid_method" })
}
export const PATCH: APIRoute = handleProviderUpdate
export const POST: APIRoute = handleProviderUpdate
