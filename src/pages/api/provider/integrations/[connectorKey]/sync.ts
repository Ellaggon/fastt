import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	redirectIntegrationsError,
	redirectIntegrationsSuccess,
	resolveIntegrationUiMode,
} from "@/lib/provider-integration-redirects"
import { syncProviderIntegration } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const uiMode = resolveIntegrationUiMode(form?.get("uiMode"))
	const returnTo = form?.get("returnTo")
	const connectionId = String(form?.get("connectionId") ?? "") || null
	try {
		const auth = await requireProviderIntegrationManager(request)
		const result = await syncProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
			connectionId,
		})
		return redirectIntegrationsSuccess(
			request,
			result.status === "connected" ? "sync_tested" : "reference_checked",
			uiMode,
			{ returnTo, params: { connectionId } }
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode, {
			returnTo,
			params: { connectionId },
		})
	}
}
