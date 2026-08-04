import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { activateProviderChannelManagerProduction } from "@/lib/provider-integrations"
import { routes } from "@/lib/routes"

function redirect(
	request: Request,
	connectionId: string,
	result: "activated" | "blocked",
	returnTo?: FormDataEntryValue | null
) {
	const fallback = routes.providerSettingsIntegrationConnection(connectionId)
	const requested = String(returnTo ?? "")
	const target = requested === fallback ? requested : fallback
	const url = new URL(target, request.url)
	url.searchParams.set("production", result)
	return Response.redirect(url, 303)
}

export const POST: APIRoute = async ({ request, params }) => {
	const connectionId = String(params.connectionId ?? "").trim()
	const form = await request.formData().catch(() => null)
	const returnTo = form?.get("returnTo")
	try {
		const auth = await requireProviderIntegrationManager(request)
		if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED")
		if (
			String(form?.get("confirmProduction") ?? "") !== "ACTIVAR" ||
			String(form?.get("confirmImpact") ?? "") !== "confirmed"
		) {
			throw new Error("INTEGRATION_PRODUCTION_CONFIRMATION_REQUIRED")
		}
		await activateProviderChannelManagerProduction({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectionId,
		})
		return redirect(request, connectionId, "activated", returnTo)
	} catch (error) {
		if (error instanceof Response) return error
		return redirect(request, connectionId, "blocked", returnTo)
	}
}
