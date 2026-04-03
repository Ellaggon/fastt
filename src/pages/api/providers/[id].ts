import type { APIRoute } from "astro"
import { providerV2Repository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { updateProviderIdentityV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

async function handleProviderUpdate(ctx: Parameters<APIRoute>[0]): Promise<Response> {
	const { request, params } = ctx
	void params.id

	try {
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
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

		if (shouldReturnHtmlRedirect(request)) {
			const url = new URL("/provider?success=saved", request.url)
			return Response.redirect(url, 303)
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof ValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", errors: error.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const message = error instanceof Error ? error.message : "Unknown error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}

export const PATCH: APIRoute = handleProviderUpdate
export const POST: APIRoute = handleProviderUpdate
