import type { APIRoute } from "astro"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { registerProviderV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function shouldReturnHtmlRedirect(request: Request): boolean {
	const accept = (request.headers.get("accept") || "").toLowerCase()
	return accept.includes("text/html")
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
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

		if (shouldReturnHtmlRedirect(request)) {
			const url = new URL("/provider?success=saved", request.url)
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
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
