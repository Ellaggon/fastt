import type { APIRoute } from "astro"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
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
		const auth = await requireProviderIntegrationManager(request)
		await connectProviderIntegration({
			providerId: auth.providerId,
			currentUserId: auth.user.id,
			connectorKey: params.connectorKey ?? "",
			mode: String(form.get("mode") ?? "sandbox"),
			scopes: form.getAll("scopes"),
			endpointUrl: String(form.get("endpointUrl") ?? ""),
			credentialSecret: String(form.get("credentialSecret") ?? ""),
			connectionId: String(form.get("connectionId") ?? "") || null,
			displayName: String(form.get("displayName") ?? "") || null,
			createNew: form.get("createNew") === "true",
			vendorKey: String(form.get("vendorKey") ?? "") || null,
			authType: String(form.get("authType") ?? "") || null,
			externalPropertyId: String(form.get("externalPropertyId") ?? "") || null,
		})
		return redirectIntegrationsSuccess(request, "integration_saved", uiMode)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode)
	}
}
