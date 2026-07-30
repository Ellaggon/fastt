import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { createProviderExternalCalendar } from "@/lib/provider-external-calendars"

function redirect(request: Request, key: "added" | "error", detail?: string) {
	const url = new URL("/rates/calendar/connections", request.url)
	url.searchParams.set("ical", key)
	if (detail) url.searchParams.set("reason", detail)
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	try {
		const auth = await requireProviderIntegrationManager(request)
		await createProviderExternalCalendar({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			name: String(form.get("name") ?? ""),
			variantId: String(form.get("variantId") ?? ""),
			resourceId: String(form.get("resourceId") ?? "") || null,
			resourceLabel: String(form.get("resourceLabel") ?? "") || null,
			feedUrl: String(form.get("feedUrl") ?? ""),
		})
		return redirect(request, "added")
	} catch (error) {
		return redirect(request, "error", error instanceof Error ? error.message : "ICAL_SYNC_FAILED")
	}
}
