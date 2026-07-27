import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	redirectIntegrationsError,
	redirectIntegrationsSuccess,
	resolveIntegrationUiMode,
} from "@/lib/provider-integration-redirects"
import { revokeProviderIntegration } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const uiMode = resolveIntegrationUiMode(form?.get("uiMode"))
	try {
		if (String(form?.get("confirmDisconnect") ?? "") !== "DESCONECTAR") {
			throw new Error("DISCONNECT_CONFIRMATION_REQUIRED")
		}
		const auth = await requireProviderIntegrationManager(request)
		await revokeProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
			connectionId: String(form?.get("connectionId") ?? "") || null,
		})
		return redirectIntegrationsSuccess(request, "integration_revoked", uiMode)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode)
	}
}
