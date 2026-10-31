import { Readable } from "node:stream"
import { afterEach, expect, test, vi } from "vitest"
const mocks = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }))
vi.mock("@/container/shared.container", () => ({
	r2: { send: vi.fn() },
	getDocumentR2Client: () => ({ send: mocks.send }),
}))
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }))
import {
	confirmDirectDocumentUpload,
	createDirectDocumentUpload,
} from "@/lib/provider-document-storage"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import { documentSubmissionId } from "@/lib/documents/upload-contract"

afterEach(() => {
	vi.unstubAllEnvs()
	vi.resetAllMocks()
})
function setup() {
	for (const [key, value] of Object.entries({
		R2_DOCUMENTS_ACCOUNT_ID: "private-account",
		R2_DOCUMENTS_BUCKET_NAME: "private",
		R2_DOCUMENTS_ACCESS_KEY_ID: "private-key",
		R2_DOCUMENTS_SECRET_ACCESS_KEY: "secret",
	}))
		vi.stubEnv(key, value)
	const bytes = Buffer.from("synthetic")
	const input = {
		idempotencyKey: "retry",
		fileName: "file.pdf",
		mimeType: "application/pdf",
		sizeBytes: bytes.length,
		sha256: documentIntegrity(bytes, null).sha256,
	}
	return { bytes, input }
}
test("signs immutable provider-bound PUT with bounded length and MIME", async () => {
	const { input } = setup()
	mocks.sign.mockResolvedValue("https://private.test/signed")
	const result = await createDirectDocumentUpload("owner", input)
	const command = mocks.sign.mock.calls[0][1].input
	expect(command.Key).toBe(
		`provider-documents/owner/${documentSubmissionId("owner", "retry")}/original`
	)
	expect(command).toMatchObject({
		IfNoneMatch: "*",
		ContentLength: input.sizeBytes,
		ContentType: input.mimeType,
	})
	expect(result.headers["if-none-match"]).toBe("*")
	expect(documentSubmissionId("other", "retry")).not.toBe(documentSubmissionId("owner", "retry"))
})
test("does not sign excessive sizes, arbitrary URLs or invalid hashes", async () => {
	const { input } = setup()
	for (const invalid of [
		{ ...input, sizeBytes: 13 * 1024 * 1024 },
		{ ...input, fileUrl: "https://evil.test" },
		{ ...input, sha256: "bad" },
	])
		await expect(createDirectDocumentUpload("owner", invalid)).rejects.toThrow()
	expect(mocks.sign).not.toHaveBeenCalled()
})
test("confirmation downloads and hashes bytes, not only client-supplied metadata", async () => {
	const { input, bytes } = setup()
	mocks.send
		.mockResolvedValueOnce({
			ContentLength: bytes.length,
			ContentType: input.mimeType,
			Metadata: { sha256: input.sha256 },
		})
		.mockResolvedValueOnce({ ContentLength: bytes.length, Body: Readable.from([bytes]) })
	expect((await confirmDirectDocumentUpload("owner", input)).bytes).toEqual(bytes)
	expect(mocks.send.mock.calls.every(([command]) => command.input.Key.includes("/owner/"))).toBe(
		true
	)
})
test("forged HEAD fingerprint cannot hide different file bytes", async () => {
	const { input, bytes } = setup()
	mocks.send
		.mockResolvedValueOnce({
			ContentLength: bytes.length,
			ContentType: input.mimeType,
			Metadata: { sha256: input.sha256 },
		})
		.mockResolvedValueOnce({ Body: Readable.from([Buffer.alloc(bytes.length, 1)]) })
	await expect(confirmDirectDocumentUpload("owner", input)).rejects.toThrow(
		"document_integrity_mismatch"
	)
})
test("bounded stream rejects excessive payload even without ContentLength", async () => {
	const { input, bytes } = setup()
	mocks.send
		.mockResolvedValueOnce({
			ContentLength: bytes.length,
			ContentType: input.mimeType,
			Metadata: { sha256: input.sha256 },
		})
		.mockResolvedValueOnce({ Body: Readable.from([Buffer.alloc(bytes.length + 1)]) })
	await expect(confirmDirectDocumentUpload("owner", input)).rejects.toThrow(
		"document_processing_source_too_large"
	)
})
