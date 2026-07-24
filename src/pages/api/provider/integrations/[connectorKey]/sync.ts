import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	redirectIntegrationsError,
	redirectIntegrationsSuccess,
	resolveIntegrationUiMode,
} from "@/lib/provider-integration-redirects"
import { syncProviderIntegration } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData().catch(() => null)
	const uiMode = resolveIntegrationUiMode(form?.get("uiMode"))
	try {
		const auth = await requireProvider(request)
		await syncProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
		})
		return redirectIntegrationsSuccess(request, "sync_tested", uiMode)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode)
	}
}
