import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { createProviderExternalCalendarExport } from "@/lib/provider-external-calendars"

export const POST: APIRoute = async ({ request }) => {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
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
		url.searchParams.set("exportUrl", result.url)
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set(
			"reason",
			error instanceof Error ? error.message : "ICAL_EXPORT_CREATE_FAILED"
		)
	}
	return Response.redirect(url, 303)
}
