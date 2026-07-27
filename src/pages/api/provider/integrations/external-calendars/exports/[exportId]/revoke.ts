import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { revokeProviderExternalCalendarExport } from "@/lib/provider-external-calendars"

export const POST: APIRoute = async ({ request, params }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		await revokeProviderExternalCalendarExport({
			providerId: auth.providerId,
			exportId: String(params.exportId ?? ""),
		})
		url.searchParams.set("ical", "export_revoked")
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set(
			"reason",
			error instanceof Error ? error.message : "ICAL_EXPORT_REVOKE_FAILED"
		)
	}
	return Response.redirect(url, 303)
}
