import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { setPrimaryProviderIntegrationConnection } from "@/lib/provider-integration-operations"

export const POST: APIRoute = async ({ request, params }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		await setPrimaryProviderIntegrationConnection({
			providerId: auth.providerId,
			connectionId: String(params.connectionId ?? ""),
		})
		url.searchParams.set("operation", "primary_changed")
	} catch (error) {
		url.searchParams.set("operation", "error")
		url.searchParams.set(
			"reason",
			(error instanceof Error ? error.message : "connection_error").slice(0, 100)
		)
	}
	return Response.redirect(url, 303)
}
