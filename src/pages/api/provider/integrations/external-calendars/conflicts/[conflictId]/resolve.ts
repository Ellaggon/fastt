import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { resolveProviderExternalCalendarConflict } from "@/lib/provider-external-calendars"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	try {
		const auth = await requireProviderIntegrationManager(request)
		const actionRaw = String(form?.get("action") ?? "resolve")
		const action =
			actionRaw === "accept" || actionRaw === "ignore" || actionRaw === "resolve"
				? actionRaw
				: "resolve"
		await resolveProviderExternalCalendarConflict({
			providerId: auth.providerId,
			conflictId: String(params.conflictId ?? ""),
			action,
			currentUserId: auth.user.id,
		})
		url.searchParams.set("ical", "conflict_updated")
	} catch (error) {
		url.searchParams.set("ical", "error")
		url.searchParams.set(
			"reason",
			error instanceof Error ? error.message : "ICAL_CONFLICT_NOT_FOUND"
		)
	}
	return Response.redirect(url, 303)
}
