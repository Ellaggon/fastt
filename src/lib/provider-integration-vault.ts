import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"

export type ProviderIntegrationOAuthVaultPayload = {
	v: 1
	authType: "oauth2"
	tokenType: string
	accessToken: string
	refreshToken?: string | null
	scope?: string | null
	obtainedAt: string
	expiresAt?: string | null
	vendor?: string | null
}

export type ProviderIntegrationOpaqueVaultPayload = {
	v: 1
	authType: "api_key" | "reference"
	secret: string
	obtainedAt: string
	vendor?: string | null
}

export type ProviderIntegrationVaultPayload =
	| ProviderIntegrationOAuthVaultPayload
	| ProviderIntegrationOpaqueVaultPayload

export type ProviderIntegrationEncryptedSecret = {
	v: 1
	alg: "aes-256-gcm"
	kid: string
	iv: string
	tag: string
	ciphertext: string
}

const CURRENT_KEY_ENV = "PROVIDER_INTEGRATION_SECRETS_KEY"
const PREVIOUS_KEYS_ENV = "PROVIDER_INTEGRATION_SECRETS_PREVIOUS_KEYS"
const LOCAL_FALLBACK_SECRET = "fastt-local-provider-integration-vault-development-only-secret"

function envTrim(key: string): string {
	return String(process.env[key] ?? "").trim()
}

function isTestLikeRuntime(): boolean {
	return (
		process.env.NODE_ENV !== "production" &&
		Boolean(process.env.VITEST || process.env.NODE_ENV === "test")
	)
}

function getCurrentSecret(): string {
	const configured = envTrim(CURRENT_KEY_ENV)
	if (configured.length >= 32) return configured
	if (process.env.NODE_ENV === "production" && !isTestLikeRuntime()) {
		throw new Error("INTEGRATION_VAULT_KEY_REQUIRED")
	}
	return LOCAL_FALLBACK_SECRET
}

function allSecrets(): string[] {
	const current = getCurrentSecret()
	const previous = envTrim(PREVIOUS_KEYS_ENV)
		.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length >= 32)
	return [current, ...previous]
}

function keyId(secret: string): string {
	return createHmac("sha256", "fastt:provider-integration-vault:kid")
		.update(secret)
		.digest("hex")
		.slice(0, 16)
}

function keyBytes(secret: string): Buffer {
	return createHmac("sha256", "fastt:provider-integration-vault:key").update(secret).digest()
}

function aad(params: { providerId: string; connectionId: string; authType: string }): Buffer {
	return Buffer.from(
		`fastt:provider-integration-vault:v1:${params.providerId}:${params.connectionId}:${params.authType}`,
		"utf8"
	)
}

export function encryptProviderIntegrationSecret(params: {
	providerId: string
	connectionId: string
	payload: ProviderIntegrationVaultPayload
}): ProviderIntegrationEncryptedSecret {
	const secret = getCurrentSecret()
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", keyBytes(secret), iv)
	cipher.setAAD(
		aad({
			providerId: params.providerId,
			connectionId: params.connectionId,
			authType: params.payload.authType,
		})
	)
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(params.payload), "utf8"),
		cipher.final(),
	])
	return {
		v: 1,
		alg: "aes-256-gcm",
		kid: keyId(secret),
		iv: iv.toString("base64url"),
		tag: cipher.getAuthTag().toString("base64url"),
		ciphertext: ciphertext.toString("base64url"),
	}
}

export function decryptProviderIntegrationSecret(params: {
	providerId: string
	connectionId: string
	authType: string
	encrypted: unknown
}): ProviderIntegrationVaultPayload {
	const encrypted = params.encrypted as Partial<ProviderIntegrationEncryptedSecret> | null
	if (!encrypted || encrypted.v !== 1 || encrypted.alg !== "aes-256-gcm") {
		throw new Error("INTEGRATION_VAULT_PAYLOAD_INVALID")
	}
	const matchingSecrets = allSecrets().filter((secret) => keyId(secret) === encrypted.kid)
	const candidates = matchingSecrets.length ? matchingSecrets : allSecrets()
	for (const secret of candidates) {
		try {
			const decipher = createDecipheriv(
				"aes-256-gcm",
				keyBytes(secret),
				Buffer.from(String(encrypted.iv ?? ""), "base64url")
			)
			decipher.setAAD(
				aad({
					providerId: params.providerId,
					connectionId: params.connectionId,
					authType: params.authType,
				})
			)
			decipher.setAuthTag(Buffer.from(String(encrypted.tag ?? ""), "base64url"))
			const plaintext = Buffer.concat([
				decipher.update(Buffer.from(String(encrypted.ciphertext ?? ""), "base64url")),
				decipher.final(),
			]).toString("utf8")
			const payload = JSON.parse(plaintext) as ProviderIntegrationVaultPayload
			const hasSecret =
				payload.authType === "oauth2" ? Boolean(payload.accessToken) : Boolean(payload.secret)
			if (payload.v !== 1 || payload.authType !== params.authType || !hasSecret) {
				throw new Error("INTEGRATION_VAULT_PAYLOAD_INVALID")
			}
			return payload
		} catch {
			continue
		}
	}
	throw new Error("INTEGRATION_VAULT_DECRYPT_FAILED")
}

export function shouldRefreshProviderIntegrationToken(
	expiresAt: Date | string | null | undefined,
	now = new Date()
): boolean {
	if (!expiresAt) return false
	const expires = new Date(expiresAt).getTime()
	if (!Number.isFinite(expires)) return true
	return expires - now.getTime() <= 5 * 60 * 1000
}

export function isProviderIntegrationTokenExpired(
	expiresAt: Date | string | null | undefined,
	now = new Date()
): boolean {
	if (!expiresAt) return false
	const expires = new Date(expiresAt).getTime()
	if (!Number.isFinite(expires)) return true
	return expires <= now.getTime()
}
