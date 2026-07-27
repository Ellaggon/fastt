import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	removeProviderIntegrationMapping,
	upsertProviderIntegrationMapping,
} from "@/lib/provider-integration-operations"

function redirect(
	request: Request,
	result: "mapping_saved" | "mapping_removed" | "error",
	reason?: string
) {
	const url = new URL("/provider/settings/integrations", request.url)
	url.searchParams.set("mode", "pro")
	url.searchParams.set("operation", result)
	if (reason) url.searchParams.set("reason", reason.slice(0, 100))
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData()
	try {
		const auth = await requireProviderIntegrationManager(request)
		const action = String(form.get("action") ?? "upsert")
		const connectionId = String(form.get("connectionId") ?? "")
		if (action === "remove") {
			await removeProviderIntegrationMapping({
				providerId: auth.providerId,
				connectionId,
				mappingId: String(form.get("mappingId") ?? ""),
			})
			return redirect(request, "mapping_removed")
		}
		await upsertProviderIntegrationMapping({
			providerId: auth.providerId,
			connectionId,
			input: {
				mappingType: String(form.get("mappingType") ?? ""),
				localEntityType: String(form.get("localEntityType") ?? ""),
				localEntityId: String(form.get("localEntityId") ?? ""),
				externalEntityType: String(form.get("externalEntityType") ?? ""),
				externalEntityId: String(form.get("externalEntityId") ?? ""),
				externalEntityName: String(form.get("externalEntityName") ?? "") || null,
				direction: String(form.get("direction") ?? "bidirectional") as
					| "import"
					| "export"
					| "bidirectional",
			},
		})
		return redirect(request, "mapping_saved")
	} catch (error) {
		return redirect(request, "error", error instanceof Error ? error.message : "mapping_error")
	}
}
