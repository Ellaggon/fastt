import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	buildConnectorOAuthAuthorizeUrl,
	buildConnectorOAuthRedirectUri,
	createConnectorOAuthState,
	getConnectorOAuthStatus,
} from "@/lib/provider-connector-oauth"
import {
	redirectIntegrationsError,
	resolveIntegrationUiMode,
} from "@/lib/provider-integration-redirects"
import { listProviderConnectorCatalog } from "@/lib/provider-integrations"

export const POST: APIRoute = async ({ request, params }) => {
	const form = await request.formData()
	const uiMode = resolveIntegrationUiMode(form.get("uiMode"))
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectorKey = String(params.connectorKey ?? "")
			.trim()
			.toLowerCase()
		const catalog = listProviderConnectorCatalog()
		if (!catalog.some((item) => item.key === connectorKey)) {
			return redirectIntegrationsError(request, "unknown_connector", uiMode)
		}

		const status = getConnectorOAuthStatus()
		if (status.mode !== "oauth_scaffold" && status.mode !== "oauth_live") {
			return redirectIntegrationsError(request, "oauth_not_configured", uiMode)
		}

		const modeRaw = String(form.get("mode") ?? "sandbox")
			.trim()
			.toLowerCase()
		const mode = modeRaw === "production" ? "production" : "sandbox"
		const redirectUri = buildConnectorOAuthRedirectUri(new URL(request.url).origin)
		const state = createConnectorOAuthState({
			providerId: auth.providerId,
			connectorKey,
			actorUserId: auth.user.id,
			uiMode,
			mode,
		})
		const authorizeUrl = buildConnectorOAuthAuthorizeUrl({
			connectorKey,
			providerId: auth.providerId,
			redirectUri,
			state,
			scopes: form.getAll("scopes").map(String).filter(Boolean),
		})
		if (!authorizeUrl) {
			return redirectIntegrationsError(request, "oauth_authorize_unavailable", uiMode)
		}
		return Response.redirect(authorizeUrl, 303)
	} catch (error) {
		const message = error instanceof Error ? error.message : "integration_error"
		return redirectIntegrationsError(request, message, uiMode)
	}
}
