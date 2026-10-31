import { afterEach, expect, it, vi } from "vitest"
const clients = vi.hoisted(() => ({ publicSend: vi.fn(), privateSend: vi.fn() }))
vi.mock("@/container/shared.container", () => ({
	r2: { send: clients.publicSend },
	getDocumentR2Client: () => ({ send: clients.privateSend }),
}))
import {
	inspectProviderDocumentPreview,
	uploadProviderDocumentObject,
} from "@/lib/provider-document-storage"
import { documentIntegrity } from "@/lib/documents/object-integrity"
afterEach(() => {
	vi.unstubAllEnvs()
	vi.clearAllMocks()
})
function configure() {
	for (const [key, value] of Object.entries({
		R2_DOCUMENTS_ACCOUNT_ID: "account",
		R2_DOCUMENTS_BUCKET_NAME: "private",
		R2_DOCUMENTS_ACCESS_KEY_ID: "private-key",
		R2_DOCUMENTS_SECRET_ACCESS_KEY: "private-secret",
		R2_ACCOUNT_ID: "account",
		R2_BUCKET_NAME: "public",
		R2_ACCESS_KEY_ID: "public-key",
		R2_SECRET_ACCESS_KEY: "public-secret",
	}))
		vi.stubEnv(key, value)
}
it("writes new bytes only to the private client and namespace", async () => {
	configure()
	clients.privateSend.mockResolvedValue({})
	const result = await uploadProviderDocumentObject({
		providerId: "owner",
		documentId: "doc",
		fileName: "file.pdf",
		mimeType: "application/pdf",
		body: new Uint8Array([1]),
	})
	expect(result.fileUrl).toBe("r2-documents:provider-documents/owner/doc/original")
	expect(clients.privateSend.mock.calls[0][0].input.Bucket).toBe("private")
	expect(clients.publicSend).not.toHaveBeenCalled()
})
it("keeps historical object reads in their original bucket", async () => {
	configure()
	clients.publicSend.mockResolvedValue({})
	expect(
		(await inspectProviderDocumentPreview({ fileUrl: "r2:provider-documents/owner/doc/file.pdf" }))
			.state
	).toBe("ready")
	expect(clients.publicSend.mock.calls[0][0].input.Bucket).toBe("public")
	expect(clients.privateSend).not.toHaveBeenCalled()
})
it("checks new references with private credentials only", async () => {
	configure()
	clients.privateSend.mockResolvedValue({})
	expect(
		(
			await inspectProviderDocumentPreview({
				fileUrl: "r2-documents:provider-documents/owner/doc/file.pdf",
			})
		).state
	).toBe("ready")
	expect(clients.privateSend.mock.calls[0][0].input.Bucket).toBe("private")
})
it("fails new uploads rather than writing to the public bucket when private configuration is absent", async () => {
	configure()
	vi.stubEnv("R2_DOCUMENTS_BUCKET_NAME", "")
	await expect(
		uploadProviderDocumentObject({
			providerId: "owner",
			documentId: "doc",
			fileName: "file.pdf",
			mimeType: "application/pdf",
			body: new Uint8Array([1]),
		})
	).rejects.toThrow("document_storage_not_configured")
	expect(clients.publicSend).not.toHaveBeenCalled()
	expect(clients.privateSend).not.toHaveBeenCalled()
})
it("recovers a lost PUT acknowledgement only when HEAD matches the exact immutable object", async () => {
	configure()
	const body = new Uint8Array([1, 2, 3])
	clients.privateSend
		.mockRejectedValueOnce(new Error("synthetic_lost_acknowledgement"))
		.mockResolvedValueOnce({
			ContentLength: body.length,
			ContentType: "application/pdf",
			Metadata: { sha256: documentIntegrity(body, "application/pdf").sha256 },
		})
	await expect(
		uploadProviderDocumentObject({
			providerId: "owner",
			documentId: "retry",
			fileName: "file.pdf",
			mimeType: "application/pdf",
			body,
		})
	).resolves.toMatchObject({ fileUrl: "r2-documents:provider-documents/owner/retry/original" })
	expect(clients.privateSend.mock.calls[0][0].input.IfNoneMatch).toBe("*")
	expect(clients.privateSend.mock.calls[1][0].constructor.name).toBe("HeadObjectCommand")
})
it("never overwrites or accepts an existing object with a different fingerprint", async () => {
	configure()
	clients.privateSend
		.mockRejectedValueOnce(new Error("synthetic_precondition_failed"))
		.mockResolvedValueOnce({
			ContentLength: 1,
			ContentType: "application/pdf",
			Metadata: { sha256: "different" },
		})
	await expect(
		uploadProviderDocumentObject({
			providerId: "owner",
			documentId: "retry",
			fileName: "file.pdf",
			mimeType: "application/pdf",
			body: new Uint8Array([1]),
		})
	).rejects.toThrow("synthetic_precondition_failed")
	expect(clients.privateSend).toHaveBeenCalledTimes(2)
})
