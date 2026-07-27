import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { enqueueProviderExternalCalendarSyncJob } from "@/lib/provider-external-calendar-scheduler"

export const POST: APIRoute = async ({ request, params }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		await enqueueProviderExternalCalendarSyncJob({
			providerId: auth.providerId,
			calendarId: String(params.calendarId ?? ""),
			trigger: "manual",
			priority: 10,
		})
		url.searchParams.set("ical", "queued")
		url.searchParams.set("updated", "1")
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set("reason", error instanceof Error ? error.message : "ICAL_SYNC_FAILED")
	}
	return Response.redirect(url, 303)
}
