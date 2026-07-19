import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { syncProviderIntegration } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProvider(request)
		await syncProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
		})
		const url = new URL("/provider/settings/integrations?success=sync_tested", request.url)
		return Response.redirect(url, 303)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		const url = new URL("/provider/settings/integrations", request.url)
		url.searchParams.set("error", message)
		return Response.redirect(url, 303)
	}
}
