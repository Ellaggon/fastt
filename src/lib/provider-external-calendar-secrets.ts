import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const PAYLOAD_VERSION = 1
const KEY_ENV = "PROVIDER_INTEGRATION_SECRETS_KEY"
const PREVIOUS_KEYS_ENV = "PROVIDER_INTEGRATION_SECRETS_PREVIOUS_KEYS"

export type EncryptedExternalCalendarUrl = {
	v: typeof PAYLOAD_VERSION
	alg: typeof ALGORITHM
	kid: string
	iv: string
	tag: string
	ciphertext: string
}

type KeyEntry = {
	id: string
	key: Buffer
}

function keyEntry(raw: string): KeyEntry {
	const key = createHash("sha256").update(raw).digest()
	return {
		id: createHash("sha256").update(key).digest("hex").slice(0, 16),
		key,
	}
}

function resolveRawCurrentKey(explicitSecret?: string): string {
	const configured = String(explicitSecret ?? process.env[KEY_ENV] ?? "").trim()
	if (configured.length >= 32) return configured
	if (process.env.NODE_ENV === "production" && !process.env.VITEST) {
		throw new Error("ICAL_ENCRYPTION_KEY_REQUIRED")
	}
	return "fastt-dev-provider-integration-secrets-v1"
}

function resolveKeyring(explicitSecret?: string): KeyEntry[] {
	const current = resolveRawCurrentKey(explicitSecret)
	const previous = explicitSecret
		? []
		: String(process.env[PREVIOUS_KEYS_ENV] ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter((value) => value.length >= 32)
	return [...new Set([current, ...previous])].map(keyEntry)
}

function additionalData(providerId: string, calendarId: string): Buffer {
	return Buffer.from(`fastt:external-calendar-url:v1:${providerId}:${calendarId}`, "utf8")
}

function assertPayload(value: unknown): EncryptedExternalCalendarUrl {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("ICAL_ENCRYPTED_URL_INVALID")
	}
	const payload = value as Partial<EncryptedExternalCalendarUrl>
	if (
		payload.v !== PAYLOAD_VERSION ||
		payload.alg !== ALGORITHM ||
		typeof payload.kid !== "string" ||
		typeof payload.iv !== "string" ||
		typeof payload.tag !== "string" ||
		typeof payload.ciphertext !== "string"
	) {
		throw new Error("ICAL_ENCRYPTED_URL_INVALID")
	}
	return payload as EncryptedExternalCalendarUrl
}

export function encryptExternalCalendarUrl(params: {
	providerId: string
	calendarId: string
	url: string
	secret?: string
}): {
	encrypted: EncryptedExternalCalendarUrl
	fingerprint: string
} {
	const [current] = resolveKeyring(params.secret)
	const iv = randomBytes(12)
	const cipher = createCipheriv(ALGORITHM, current.key, iv)
	cipher.setAAD(additionalData(params.providerId, params.calendarId))
	const ciphertext = Buffer.concat([cipher.update(params.url, "utf8"), cipher.final()])
	return {
		encrypted: {
			v: PAYLOAD_VERSION,
			alg: ALGORITHM,
			kid: current.id,
			iv: iv.toString("base64"),
			tag: cipher.getAuthTag().toString("base64"),
			ciphertext: ciphertext.toString("base64"),
		},
		fingerprint: createHmac("sha256", current.key)
			.update(`external-calendar-url:${params.url}`)
			.digest("hex"),
	}
}

export function decryptExternalCalendarUrl(params: {
	providerId: string
	calendarId: string
	encrypted: unknown
	secret?: string
}): string {
	const payload = assertPayload(params.encrypted)
	const key = resolveKeyring(params.secret).find((entry) => entry.id === payload.kid)
	if (!key) throw new Error("ICAL_ENCRYPTION_KEY_UNAVAILABLE")
	try {
		const decipher = createDecipheriv(ALGORITHM, key.key, Buffer.from(payload.iv, "base64"))
		decipher.setAAD(additionalData(params.providerId, params.calendarId))
		decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
		return Buffer.concat([
			decipher.update(Buffer.from(payload.ciphertext, "base64")),
			decipher.final(),
		]).toString("utf8")
	} catch {
		throw new Error("ICAL_ENCRYPTED_URL_UNREADABLE")
	}
}
