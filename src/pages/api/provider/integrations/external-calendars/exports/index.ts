import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { createProviderExternalCalendarExport } from "@/lib/provider-external-calendars"
import {
	createExternalCalendarExportFlash,
	EXTERNAL_CALENDAR_EXPORT_FLASH_COOKIE,
} from "@/lib/provider-external-calendar-export-flash"

export const POST: APIRoute = async ({ request, cookies }) => {
	const url = new URL("/rates/calendar/connections", request.url)
	url.searchParams.set("view", "exports")
	const form = await request.formData()
	try {
		const auth = await requireProviderIntegrationManager(request)
		const result = await createProviderExternalCalendarExport({
			providerId: auth.providerId,
			variantId: String(form.get("variantId") ?? ""),
			label: String(form.get("label") ?? ""),
			baseUrl: request.url,
		})
		url.searchParams.set("ical", "export_created")
		cookies.set(
			EXTERNAL_CALENDAR_EXPORT_FLASH_COOKIE,
			createExternalCalendarExportFlash({
				providerId: auth.providerId,
				exportId: result.id,
				url: result.url,
			}),
			{
				httpOnly: true,
				sameSite: "lax",
				secure: import.meta.env.PROD,
				path: "/rates/calendar/connections",
				maxAge: 120,
			}
		)
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set(
			"reason",
			error instanceof Error ? error.message : "ICAL_EXPORT_CREATE_FAILED"
		)
	}
	return Response.redirect(url, 303)
}
