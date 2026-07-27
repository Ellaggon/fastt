import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { revokeProviderExternalCalendar } from "@/lib/provider-external-calendars"

export const POST: APIRoute = async ({ request, params }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		await revokeProviderExternalCalendar({
			providerId: auth.providerId,
			calendarId: String(params.calendarId ?? ""),
		})
		url.searchParams.set("ical", "revoked")
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set("reason", error instanceof Error ? error.message : "ICAL_SYNC_FAILED")
	}
	return Response.redirect(url, 303)
}
