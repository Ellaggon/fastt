import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	enqueueProviderExternalCalendarSyncJob,
	runScheduledExternalCalendarSync,
} from "@/lib/provider-external-calendar-scheduler"
import { ProviderExternalCalendar, db, eq, ne, and } from "@/shared/infrastructure/db/compat"

export const POST: APIRoute = async ({ request }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		const calendars = await db
			.select({ id: ProviderExternalCalendar.id })
			.from(ProviderExternalCalendar)
			.where(
				and(
					eq(ProviderExternalCalendar.providerId, auth.providerId),
					ne(ProviderExternalCalendar.status, "revoked")
				)
			)
		await Promise.all(
			calendars.map((calendar) =>
				enqueueProviderExternalCalendarSyncJob({
					providerId: auth.providerId,
					calendarId: calendar.id,
					trigger: "manual",
					priority: 10,
				})
			)
		)
		await runScheduledExternalCalendarSync({
			providerId: auth.providerId,
			batchSize: Math.min(10, calendars.length),
			concurrency: 2,
			providerLimit: 2,
		})
		url.searchParams.set("ical", "queued")
		url.searchParams.set("updated", String(calendars.length))
		url.searchParams.set("failed", "0")
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set("reason", error instanceof Error ? error.message : "ICAL_SYNC_FAILED")
	}
	return Response.redirect(url, 303)
}
