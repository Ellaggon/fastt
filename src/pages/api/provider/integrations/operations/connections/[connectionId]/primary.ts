import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { setPrimaryProviderIntegrationConnection } from "@/lib/provider-integration-operations"
import { routes } from "@/lib/routes"

export const POST: APIRoute = async ({ request, params }) => {
	const connectionId = String(params.connectionId ?? "")
	const url = new URL(routes.providerSettingsIntegrationConnection(connectionId), request.url)
	try {
		const auth = await requireProviderIntegrationManager(request)
		await setPrimaryProviderIntegrationConnection({
			providerId: auth.providerId,
			connectionId,
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
