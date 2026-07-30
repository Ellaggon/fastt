import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { listProviderChannelManagerRemoteProperties } from "@/lib/provider-integrations"

export const GET: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const result = await listProviderChannelManagerRemoteProperties({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectionId: String(params.connectionId ?? ""),
		})
		return Response.json(
			{
				properties: result.properties,
				fetchedAt: result.fetchedAt.toISOString(),
			},
			{
				headers: {
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			}
		)
	} catch (error) {
		if (error instanceof Response) {
			return new Response(error.body, {
				status: error.status,
				statusText: error.statusText,
				headers: {
					"Content-Type": error.headers.get("Content-Type") ?? "application/json",
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			})
		}
		const message = error instanceof Error ? error.message : "REMOTE_PROPERTIES_FAILED"
		const status = message === "INTEGRATION_CONNECTION_NOT_FOUND" ? 404 : 422
		return Response.json(
			{ error: message },
			{
				status,
				headers: {
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
				},
			}
		)
	}
}
