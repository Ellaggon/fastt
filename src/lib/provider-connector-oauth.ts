/**
 * OAuth-grade connector auth (P2 / S7-2).
 * Default integrations still use credentialsRef + HTTPS smoke.
 * With CONNECTOR_AUTH_PROVIDER=oauth2 + client credentials:
 * - oauth_scaffold: authorize URL + callback surface (no token exchange)
 * - oauth_live: authorize → token exchange → credentialsRef oauth2://…
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export type ConnectorOAuthProviderId = "none" | "oauth2"

export type ConnectorOAuthMode =
	| "credentials_ref"
	| "oauth_scaffold"
	| "oauth_live"
	| "not_configured"

export type ConnectorOAuthStatus = {
	preferred: ConnectorOAuthProviderId
	mode: ConnectorOAuthMode
	hostLabel: string
	adminHint: string
	liveEnabled: boolean
	tokenUrlPresent: boolean
}

export type ConnectorOAuthStatePayload = {
	v: 1
	providerId: string
	connectorKey: string
	actorUserId: string
	uiMode: "simple" | "pro"
	mode: "sandbox" | "production"
	nonce: string
	exp: number
}

export type ExchangeConnectorOAuthCodeResult = {
	ok: boolean
	credentialsRef?: string
	tokenType?: string
	expiresIn?: number | null
	scope?: string | null
	error?: string
	message?: string
}

function envTrim(key: string): string {
	return String(process.env[key] ?? "").trim()
}

export function resolveConnectorOAuthPreference(): ConnectorOAuthProviderId {
	const raw = envTrim("CONNECTOR_AUTH_PROVIDER").toLowerCase()
	if (raw === "oauth" || raw === "oauth2") return "oauth2"
	return "none"
}

export function isConnectorOAuthConfigured(): boolean {
	return Boolean(envTrim("CONNECTOR_OAUTH_CLIENT_ID") && envTrim("CONNECTOR_OAUTH_CLIENT_SECRET"))
}

export function isConnectorOAuthLiveEnabled(): boolean {
	const raw = envTrim("CONNECTOR_OAUTH_LIVE").toLowerCase()
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function getConnectorOAuthTokenUrl(): string {
	return envTrim("CONNECTOR_OAUTH_TOKEN_URL").replace(/\/$/, "")
}

export function getConnectorOAuthStatus(): ConnectorOAuthStatus {
	const preferred = resolveConnectorOAuthPreference()
	const liveEnabled = isConnectorOAuthLiveEnabled()
	const tokenUrlPresent = Boolean(getConnectorOAuthTokenUrl())

	if (preferred === "none") {
		return {
			preferred,
			mode: "credentials_ref",
			liveEnabled,
			tokenUrlPresent,
			hostLabel: "Referencia HTTPS / vault (no OAuth)",
			adminHint:
				"Connect usa credentialsRef + smoke. OAuth: CONNECTOR_AUTH_PROVIDER=oauth2 + client id/secret (+ TOKEN_URL + CONNECTOR_OAUTH_LIVE=1 para exchange).",
		}
	}
	if (!isConnectorOAuthConfigured()) {
		return {
			preferred,
			mode: "not_configured",
			liveEnabled,
			tokenUrlPresent,
			hostLabel: "OAuth no configurado",
			adminHint: "Faltan CONNECTOR_OAUTH_CLIENT_ID / CONNECTOR_OAUTH_CLIENT_SECRET.",
		}
	}
	if (liveEnabled && tokenUrlPresent && envTrim("CONNECTOR_OAUTH_AUTHORIZE_URL")) {
		return {
			preferred,
			mode: "oauth_live",
			liveEnabled: true,
			tokenUrlPresent: true,
			hostLabel: "OAuth live (authorize + token exchange)",
			adminHint:
				"OAuth live activo. Start → vendor authorize → callback exchange → credentialsRef oauth2://…",
		}
	}
	return {
		preferred,
		mode: "oauth_scaffold",
		liveEnabled,
		tokenUrlPresent,
		hostLabel: liveEnabled
			? "OAuth scaffold (falta TOKEN_URL o AUTHORIZE_URL)"
			: "OAuth preparado (scaffold — falta CONNECTOR_OAUTH_LIVE=1)",
		adminHint: liveEnabled
			? "Credenciales presentes. Define CONNECTOR_OAUTH_AUTHORIZE_URL + CONNECTOR_OAUTH_TOKEN_URL para exchange live."
			: "Credenciales OAuth presentes. Opt-in CONNECTOR_OAUTH_LIVE=1 + TOKEN_URL para connect OAuth-grade.",
	}
}

export type BuildConnectorOAuthAuthorizeUrlInput = {
	connectorKey: string
	providerId: string
	redirectUri: string
	state: string
	scopes?: string[]
}

/** Authorize URL when OAuth scaffold/live is configured; null otherwise. */
export function buildConnectorOAuthAuthorizeUrl(
	input: BuildConnectorOAuthAuthorizeUrlInput
): string | null {
	const status = getConnectorOAuthStatus()
	if (status.mode !== "oauth_scaffold" && status.mode !== "oauth_live") return null
	const authorizeBase = envTrim("CONNECTOR_OAUTH_AUTHORIZE_URL").replace(/\/$/, "")
	const clientId = envTrim("CONNECTOR_OAUTH_CLIENT_ID")
	if (!authorizeBase || !clientId) return null

	const url = new URL(authorizeBase)
	url.searchParams.set("response_type", "code")
	url.searchParams.set("client_id", clientId)
	url.searchParams.set("redirect_uri", input.redirectUri)
	url.searchParams.set("state", input.state)
	url.searchParams.set("connector", input.connectorKey)
	url.searchParams.set("provider_id", input.providerId)
	if (input.scopes?.length) url.searchParams.set("scope", input.scopes.join(" "))
	return url.toString()
}

function stateSigningSecret(): string {
	return (
		envTrim("CONNECTOR_OAUTH_STATE_SECRET") ||
		envTrim("CONNECTOR_OAUTH_CLIENT_SECRET") ||
		"fastt-oauth-dev-state"
	)
}

function b64url(input: string | Buffer): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "")
}

function fromB64url(input: string): Buffer {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/")
	const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
	return Buffer.from(padded + pad, "base64")
}

export function createConnectorOAuthState(
	payload: Omit<ConnectorOAuthStatePayload, "v" | "nonce" | "exp"> & {
		ttlSeconds?: number
	}
): string {
	const body: ConnectorOAuthStatePayload = {
		v: 1,
		providerId: payload.providerId,
		connectorKey: payload.connectorKey,
		actorUserId: payload.actorUserId,
		uiMode: payload.uiMode,
		mode: payload.mode,
		nonce: randomBytes(8).toString("hex"),
		exp: Math.floor(Date.now() / 1000) + (payload.ttlSeconds ?? 600),
	}
	const encoded = b64url(JSON.stringify(body))
	const sig = createHmac("sha256", stateSigningSecret()).update(encoded).digest()
	return `${encoded}.${b64url(sig)}`
}

export function parseConnectorOAuthState(raw: string): ConnectorOAuthStatePayload | null {
	const value = String(raw ?? "").trim()
	const [encoded, sigPart] = value.split(".")
	if (!encoded || !sigPart) return null
	const expected = createHmac("sha256", stateSigningSecret()).update(encoded).digest()
	let provided: Buffer
	try {
		provided = fromB64url(sigPart)
	} catch {
		return null
	}
	if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null
	try {
		const json = JSON.parse(fromB64url(encoded).toString("utf8")) as ConnectorOAuthStatePayload
		if (json.v !== 1) return null
		if (!json.providerId || !json.connectorKey || !json.actorUserId) return null
		if (typeof json.exp !== "number" || json.exp < Math.floor(Date.now() / 1000)) return null
		if (json.uiMode !== "simple" && json.uiMode !== "pro") return null
		if (json.mode !== "sandbox" && json.mode !== "production") return null
		return json
	} catch {
		return null
	}
}

export function buildConnectorOAuthRedirectUri(origin: string): string {
	const base = String(origin ?? "")
		.trim()
		.replace(/\/$/, "")
	return `${base}/api/provider/integrations/oauth/callback`
}

export function buildConnectorOAuthCredentialsRef(connectorKey: string): string {
	const key = String(connectorKey ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "_")
	return `oauth2://${key || "connector"}`
}

/**
 * Authorization-code token exchange (OAuth live).
 * Does not persist raw access_token — returns opaque oauth2:// credentialsRef.
 */
export async function exchangeConnectorOAuthCode(params: {
	code: string
	redirectUri: string
	connectorKey: string
}): Promise<ExchangeConnectorOAuthCodeResult> {
	const status = getConnectorOAuthStatus()
	if (status.mode !== "oauth_live") {
		return {
			ok: false,
			error: "oauth_not_live",
			message:
				status.mode === "oauth_scaffold"
					? "OAuth en scaffold. Activa CONNECTOR_OAUTH_LIVE=1 + TOKEN_URL."
					: "OAuth no configurado para exchange.",
		}
	}

	const tokenUrl = getConnectorOAuthTokenUrl()
	const clientId = envTrim("CONNECTOR_OAUTH_CLIENT_ID")
	const clientSecret = envTrim("CONNECTOR_OAUTH_CLIENT_SECRET")
	if (!tokenUrl || !clientId || !clientSecret) {
		return {
			ok: false,
			error: "oauth_token_not_configured",
			message: "Falta CONNECTOR_OAUTH_TOKEN_URL o client credentials.",
		}
	}

	try {
		const response = await fetch(tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "application/json",
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: params.code,
				redirect_uri: params.redirectUri,
				client_id: clientId,
				client_secret: clientSecret,
			}),
		})
		const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
		if (!response.ok) {
			const errMsg =
				typeof json.error_description === "string"
					? json.error_description
					: typeof json.error === "string"
						? json.error
						: `token_http_${response.status}`
			return {
				ok: false,
				error: "oauth_token_exchange_failed",
				message: errMsg,
			}
		}
		const accessToken = typeof json.access_token === "string" ? json.access_token : ""
		if (!accessToken) {
			return {
				ok: false,
				error: "oauth_token_missing",
				message: "El vendor no devolvió access_token.",
			}
		}
		return {
			ok: true,
			credentialsRef: buildConnectorOAuthCredentialsRef(params.connectorKey),
			tokenType: typeof json.token_type === "string" ? json.token_type : "bearer",
			expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
			scope: typeof json.scope === "string" ? json.scope : null,
		}
	} catch (error) {
		return {
			ok: false,
			error: "oauth_token_request_failed",
			message: error instanceof Error ? error.message : String(error),
		}
	}
}
