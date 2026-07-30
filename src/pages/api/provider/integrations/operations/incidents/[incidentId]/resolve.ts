import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { safeIntegrationReturnTo } from "@/lib/provider-integration-redirects"
import { resolveProviderIntegrationIncident } from "@/lib/provider-integration-operations"
import { routes } from "@/lib/routes"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const url =
		safeIntegrationReturnTo(request, form?.get("returnTo")) ??
		new URL(routes.providerSettingsIntegrationsIncidents(), request.url)
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
