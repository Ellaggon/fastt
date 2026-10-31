import { createHash } from "node:crypto"

export function documentIntegrity(bytes: Uint8Array, mimeType: string | null) {
	return {
		version: 1 as const,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		byteSize: bytes.byteLength,
		declaredMimeType: mimeType,
	}
}

export function assertDocumentIntegrity(bytes: Uint8Array, expected: unknown) {
	if (expected == null) return // Historical evidence has no upload fingerprint.
	if (typeof expected !== "object" || Array.isArray(expected))
		throw new Error("document_integrity_invalid")
	const value = expected as Record<string, unknown>
	if (
		value.version !== 1 ||
		typeof value.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(value.sha256) ||
		!Number.isSafeInteger(value.byteSize)
	)
		throw new Error("document_integrity_invalid")
	const actual = documentIntegrity(bytes, null)
	if (actual.sha256 !== value.sha256 || actual.byteSize !== value.byteSize)
		throw new Error("document_integrity_mismatch")
}
