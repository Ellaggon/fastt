import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { connectProviderIntegration } from "@/lib/provider-integrations"

function redirect(request: Request, params: URLSearchParams) {
	const url = new URL("/provider/settings/integrations", request.url)
	params.forEach((value, key) => url.searchParams.set(key, value))
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProvider(request)
		const form = await request.formData()
		await connectProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
			mode: String(form.get("mode") ?? "sandbox"),
			scopes: form.getAll("scopes"),
			credentialsRef: String(form.get("credentialsRef") ?? ""),
		})
		return redirect(request, new URLSearchParams({ success: "integration_saved" }))
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirect(request, new URLSearchParams({ error: message }))
	}
}
