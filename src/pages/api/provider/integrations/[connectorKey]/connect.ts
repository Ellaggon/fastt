import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	redirectIntegrationsError,
	redirectIntegrationsSuccess,
	resolveIntegrationUiMode,
} from "@/lib/provider-integration-redirects"
import { connectProviderIntegration } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData()
	const uiMode = resolveIntegrationUiMode(form.get("uiMode"))
	try {
		const auth = await requireProvider(request)
		await connectProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
			mode: String(form.get("mode") ?? "sandbox"),
			scopes: form.getAll("scopes"),
			credentialsRef: String(form.get("credentialsRef") ?? ""),
		})
		return redirectIntegrationsSuccess(request, "integration_saved", uiMode)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode)
	}
}
