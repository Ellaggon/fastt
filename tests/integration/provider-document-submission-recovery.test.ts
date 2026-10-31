import { randomUUID } from "node:crypto"
import { expect, it, vi } from "vitest"
import { submitProviderDocument } from "@/lib/provider-documents"
import * as storage from "@/lib/provider-document-storage"
import * as audit from "@/lib/provider-audit"
import {
	db,
	eq,
	ProviderAuditLog,
	ProviderDocument,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
} from "@/shared/infrastructure/db/compat"
import { upsertProvider } from "../test-support/catalog-db-test-data"

it("reuses an uploaded object after registration rollback and commits exactly one document and audit", async () => {
	const ownerEmail = "document.recovery@example.com"
	const providerId = "provider_document_recovery"
	await upsertProvider({
		id: providerId,
		legalName: "Synthetic recovery",
		displayName: "Synthetic recovery",
		ownerEmail,
	})
	const input = {
		providerId,
		actorUserId: `user_${ownerEmail}`,
		idempotencyKey: randomUUID(),
		type: "business_registration",
		fileName: "synthetic.pdf",
		mimeType: "application/pdf",
		fileBytes: Buffer.from("%PDF-1.4\n%%EOF"),
	}
	const objects = new Set<string>()
	const configured = vi.spyOn(storage, "isR2DocumentStorageConfigured").mockReturnValue(true)
	const upload = vi
		.spyOn(storage, "uploadProviderDocumentObject")
		.mockImplementation(async (params) => {
			const objectKey = `provider-documents/${params.providerId}/${params.documentId}/original`
			objects.add(objectKey)
			return { objectKey, fileUrl: `r2-documents:${objectKey}` }
		})
	const auditWrite = vi
		.spyOn(audit, "writeProviderAuditLog")
		.mockRejectedValueOnce(new Error("synthetic_registration_failure"))
	try {
		await expect(submitProviderDocument(input)).rejects.toMatchObject({
			message: "document_registration_unconfirmed",
			status: 503,
		})
		expect(objects.size).toBe(1)
		expect(
			await db.select().from(ProviderDocument).where(eq(ProviderDocument.providerId, providerId))
		).toHaveLength(0)
		const result = await submitProviderDocument(input)
		const replay = await submitProviderDocument(input)
		expect(replay.id).toBe(result.id)
		expect(upload).toHaveBeenCalledTimes(2)
		expect(upload.mock.calls[0][0].documentId).toBe(upload.mock.calls[1][0].documentId)
		expect(objects.size).toBe(1)
		expect(
			await db.select().from(ProviderDocument).where(eq(ProviderDocument.providerId, providerId))
		).toHaveLength(1)
		expect(
			await db
				.select()
				.from(ProviderDocumentInspection)
				.where(eq(ProviderDocumentInspection.documentId, result.id))
		).toHaveLength(1)
		expect(
			await db
				.select()
				.from(ProviderDocumentProcessingJob)
				.where(eq(ProviderDocumentProcessingJob.documentId, result.id))
		).toHaveLength(1)
		expect(
			await db.select().from(ProviderAuditLog).where(eq(ProviderAuditLog.entityId, result.id))
		).toHaveLength(1)
		await expect(
			submitProviderDocument({ ...input, fileBytes: Buffer.from("different") })
		).rejects.toMatchObject({ status: 409 })
		expect(upload).toHaveBeenCalledTimes(2)
	} finally {
		auditWrite.mockRestore()
		upload.mockRestore()
		configured.mockRestore()
	}
})

it("does not execute a second upload while the same submission lease is active", async () => {
	const ownerEmail = "document.concurrent@example.com",
		providerId = "provider_document_concurrent"
	await upsertProvider({
		id: providerId,
		legalName: "Synthetic concurrency",
		displayName: "Synthetic concurrency",
		ownerEmail,
	})
	const input = {
		providerId,
		actorUserId: `user_${ownerEmail}`,
		idempotencyKey: randomUUID(),
		type: "business_registration",
		fileName: "synthetic.pdf",
		mimeType: "application/pdf",
		fileBytes: Buffer.from("%PDF-1.4\n%%EOF"),
	}
	let release!: () => void, entered!: () => void
	const uploading = new Promise<void>((resolve) => {
		entered = resolve
	})
	const resume = new Promise<void>((resolve) => {
		release = resolve
	})
	const configured = vi.spyOn(storage, "isR2DocumentStorageConfigured").mockReturnValue(true)
	const upload = vi
		.spyOn(storage, "uploadProviderDocumentObject")
		.mockImplementation(async (params) => {
			entered()
			await resume
			const objectKey = `provider-documents/${params.providerId}/${params.documentId}/original`
			return { objectKey, fileUrl: `r2-documents:${objectKey}` }
		})
	const first = submitProviderDocument(input)
	try {
		await uploading
		await expect(submitProviderDocument(input)).rejects.toMatchObject({
			message: "document_submission_in_progress",
			status: 409,
		})
		expect(upload).toHaveBeenCalledTimes(1)
	} finally {
		release()
		await first
		upload.mockRestore()
		configured.mockRestore()
	}
})
