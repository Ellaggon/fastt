import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * Envelope encryption for payout account identifiers (IBAN / account numbers).
 * Never store plaintext in metadataJson. Admin decrypts only for review queues.
 *
 * PROVIDER_PAYOUT_SECRETS_KEY — you generate this value yourself (not from Airbnb,
 * Supabase, or R2). Example:
 *   openssl rand -base64 48
 * Add the result to `.env` / hosting secrets. Changing the key makes existing
 * ciphertext unreadable unless you re-encrypt.
 */
const ALG = "aes-256-gcm"

function resolveKey(): Buffer {
	const raw = String(process.env.PROVIDER_PAYOUT_SECRETS_KEY ?? "").trim()
	if (raw.length >= 32) {
		return createHash("sha256").update(raw).digest()
	}
	// Deterministic local/test key — production should always set PROVIDER_PAYOUT_SECRETS_KEY.
	return createHash("sha256").update("fastt-dev-payout-secrets-v1").digest()
}

export type EncryptedAccountIdentifier = {
	alg: typeof ALG
	iv: string
	tag: string
	ciphertext: string
}

export function encryptAccountIdentifier(plaintext: string): EncryptedAccountIdentifier {
	const iv = randomBytes(12)
	const cipher = createCipheriv(ALG, resolveKey(), iv)
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
	const tag = cipher.getAuthTag()
	return {
		alg: ALG,
		iv: iv.toString("base64"),
		tag: tag.toString("base64"),
		ciphertext: encrypted.toString("base64"),
	}
}

export function decryptAccountIdentifier(payload: EncryptedAccountIdentifier): string {
	const decipher = createDecipheriv(ALG, resolveKey(), Buffer.from(payload.iv, "base64"))
	decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(payload.ciphertext, "base64")),
		decipher.final(),
	])
	return decrypted.toString("utf8")
}

export function readAccountIdentifierFromMetadata(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
	const meta = metadata as Record<string, unknown>

	const enc = meta.accountIdentifierEnc
	if (enc && typeof enc === "object" && !Array.isArray(enc)) {
		const payload = enc as Partial<EncryptedAccountIdentifier>
		if (payload.iv && payload.tag && payload.ciphertext) {
			try {
				return decryptAccountIdentifier({
					alg: ALG,
					iv: String(payload.iv),
					tag: String(payload.tag),
					ciphertext: String(payload.ciphertext),
				})
			} catch {
				return null
			}
		}
	}

	// Legacy plaintext (pre P0-3) — still readable for admin migration window.
	if (typeof meta.accountIdentifier === "string" && meta.accountIdentifier.trim()) {
		return meta.accountIdentifier.trim().toUpperCase()
	}

	return null
}

export function buildPaymentAccountMetadata(params: {
	accountIdentifier: string
	submissionNotes?: string | null
	extra?: Record<string, unknown>
}): Record<string, unknown> {
	const accountIdentifierEnc = encryptAccountIdentifier(params.accountIdentifier)
	return {
		accountIdentifierEnc,
		// Explicitly omit plaintext accountIdentifier.
		submissionNotes: params.submissionNotes ?? null,
		source: "provider.settings.payments",
		submittedAt: new Date().toISOString(),
		...(params.extra ?? {}),
	}
}
