import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { resolveProviderIntegrationIncident } from "@/lib/provider-integration-operations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		await resolveProviderIntegrationIncident({
			providerId: auth.providerId,
			incidentId: String(params.incidentId ?? ""),
			resolvedBy: auth.user.id,
			resolutionNote: String(form?.get("resolutionNote") ?? "") || null,
		})
		url.searchParams.set("operation", "incident_resolved")
	} catch (error) {
		url.searchParams.set("operation", "error")
		url.searchParams.set(
			"reason",
			(error instanceof Error ? error.message : "incident_error").slice(0, 100)
		)
	}
	return Response.redirect(url, 303)
}
