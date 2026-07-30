import type { APIRoute } from "astro"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import {
	buildConnectorOAuthRedirectUri,
	exchangeConnectorOAuthCode,
	getConnectorOAuthStatus,
	parseConnectorOAuthState,
} from "@/lib/provider-connector-oauth"
import { connectProviderIntegration } from "@/lib/provider-integrations"
import { routes } from "@/lib/routes"

/**
 * OAuth callback (P2).
 * - oauth_live: authorization-code exchange → encrypted credential vault
 * - oauth_scaffold: validates state/code shape, honest redirect (no token store)
 */
export const GET: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id) {
		return Response.redirect(new URL("/SignInPage", request.url), 303)
	}

	const status = getConnectorOAuthStatus()
	const code = String(url.searchParams.get("code") ?? "").trim()
	const stateRaw = String(url.searchParams.get("state") ?? "").trim()
	const error = String(url.searchParams.get("error") ?? "").trim()
	const connectorFromQuery = String(url.searchParams.get("connector") ?? "").trim()

	const stateForTarget = stateRaw ? parseConnectorOAuthState(stateRaw) : null
	let target = new URL(
		stateForTarget?.returnTo ?? routes.providerSettingsIntegrationsConnectChannelManager(),
		request.url
	)
	if (error) {
		target.searchParams.set("oauth", "denied")
		target.searchParams.set("reason", error.slice(0, 80))
		return Response.redirect(target, 303)
	}

	if (status.mode !== "oauth_scaffold" && status.mode !== "oauth_live") {
		target.searchParams.set("oauth", "not_configured")
		return Response.redirect(target, 303)
	}

	if (!code || !stateRaw) {
		target.searchParams.set("oauth", "missing_code")
		return Response.redirect(target, 303)
	}

	const state = stateForTarget
	if (!state) {
		target.searchParams.set("oauth", "invalid_state")
		return Response.redirect(target, 303)
	}
	if (state.returnTo) target = new URL(state.returnTo, request.url)

	if (state.actorUserId !== user.id) {
		target.searchParams.set("oauth", "actor_mismatch")
		return Response.redirect(target, 303)
	}
	const providerSurface = await getProviderSessionSurfaceFromRequest(request, user)
	if (
		providerSurface?.providerId !== state.providerId ||
		!providerSurface.permissions.canManageIntegrations
	) {
		target.searchParams.set("oauth", "permission_denied")
		return Response.redirect(target, 303)
	}

	const connectorKey = state.connectorKey || connectorFromQuery
	target.searchParams.set("connector", connectorKey)

	if (status.mode === "oauth_scaffold") {
		target.searchParams.set("oauth", "scaffold")
		return Response.redirect(target, 303)
	}

	const redirectUri = buildConnectorOAuthRedirectUri(new URL(request.url).origin)
	const exchanged = await exchangeConnectorOAuthCode({
		code,
		redirectUri,
		connectorKey,
	})
	if (!exchanged.ok || !exchanged.accessToken) {
		target.searchParams.set("oauth", "token_failed")
		target.searchParams.set("reason", String(exchanged.error ?? "exchange_failed").slice(0, 64))
		return Response.redirect(target, 303)
	}

	try {
		const connectionId = await connectProviderIntegration({
			providerId: state.providerId,
			currentUserId: state.actorUserId,
			connectorKey,
			mode: state.mode,
			vendorKey: state.vendorKey,
			authType: "oauth2",
			scopes: exchanged.scope ? exchanged.scope.split(/\s+/).filter(Boolean) : [],
			oauthCredential: exchanged.accessToken
				? {
						accessToken: exchanged.accessToken,
						refreshToken: exchanged.refreshToken ?? null,
						tokenType: exchanged.tokenType,
						expiresIn: exchanged.expiresIn,
						scope: exchanged.scope,
					}
				: undefined,
		})
		target.searchParams.set("connectionId", connectionId)
	} catch (connectError) {
		target.searchParams.set("oauth", "persist_failed")
		target.searchParams.set(
			"reason",
			(connectError instanceof Error ? connectError.message : "persist_failed").slice(0, 64)
		)
		return Response.redirect(target, 303)
	}

	target.searchParams.set("oauth", "connected")
	target.searchParams.set("success", "integration_saved")
	return Response.redirect(target, 303)
}
