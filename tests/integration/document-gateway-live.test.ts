import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { expect, it } from "vitest"
import { getDocumentR2Client } from "@/container/shared.container"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import {
	createDirectDocumentUpload,
	confirmDirectDocumentUpload,
	buildProviderDocumentObjectKey,
	toProviderDocumentFileRef,
} from "@/lib/provider-document-storage"
import { documentSubmissionId } from "@/lib/documents/upload-contract"
import {
	documentInspectionGate,
	getProviderDocumentInspection,
	runProviderDocumentProcessingWorker,
} from "@/lib/documents/document-processing"
import {
	db,
	eq,
	ProviderDocument,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
} from "@/shared/infrastructure/db/compat"
import { upsertProvider } from "../test-support/catalog-db-test-data"

it.skipIf(process.env.FASTT_CERTIFY_LOCAL_GATEWAY !== "1")(
	"certifies signed direct R2 upload → local antivirus/OCR → isolated PostgreSQL without approval",
	async () => {
		if (
			process.env.FASTT_DATA_ENV !== "test" ||
			process.env.DOCUMENT_ANALYSIS_GATEWAY_URL !== "http://127.0.0.1:4319/v1/documents/analyze"
		)
			throw new Error("isolated_local_certification_required")
		const providerId = `gateway-worker-certification-${randomUUID()}`,
			idempotencyKey = randomUUID(),
			documentId = documentSubmissionId(providerId, idempotencyKey)
		const bytes = Buffer.from(
			await readFile(
				new URL("../../services/document-analysis/fixtures/synthetic.pdf.b64", import.meta.url),
				"utf8"
			),
			"base64"
		)
		const integrity = documentIntegrity(bytes, "application/pdf"),
			config = documentStorageConfig()!
		await upsertProvider({
			id: providerId,
			legalName: "Synthetic gateway certification",
			displayName: "Synthetic gateway certification",
		})
		const input = {
			idempotencyKey,
			fileName: "synthetic.pdf",
			mimeType: "application/pdf",
			sizeBytes: bytes.length,
			sha256: integrity.sha256,
		}
		const signed = await createDirectDocumentUpload(providerId, input)
		const put = await fetch(signed.signedUrl, {
			method: "PUT",
			headers: signed.headers,
			body: bytes,
			redirect: "error",
			signal: AbortSignal.timeout(30_000),
		})
		if (!put.ok) throw new Error(`synthetic_upload_failed_${put.status}`)
		const objectKey = buildProviderDocumentObjectKey({
			providerId,
			documentId,
			fileName: input.fileName,
		})
		const object = { objectKey, fileUrl: toProviderDocumentFileRef(objectKey) }
		try {
			expect((await confirmDirectDocumentUpload(providerId, input)).bytes).toEqual(bytes)
			await db.insert(ProviderDocument).values({
				id: documentId,
				providerId,
				type: "business_registration",
				status: "pending",
				fileUrl: object.fileUrl,
				metadataJson: { mimeType: "application/pdf", integrity },
			})
			const result = await runProviderDocumentProcessingWorker({ limit: 1 })
			expect(result.completed).toBe(1)
			const inspection = await getProviderDocumentInspection(documentId)
			expect(inspection).toMatchObject({
				processingState: "completed",
				malwareStatus: "clean",
				ocrStatus: "completed",
				extractionStatus: "not_supported",
				sha256: integrity.sha256,
			})
			expect(documentInspectionGate(inspection)).toMatchObject({ canReveal: true, blockers: [] })
			expect(documentInspectionGate(inspection).warnings.length).toBeGreaterThan(0)
			const [document] = await db
				.select()
				.from(ProviderDocument)
				.where(eq(ProviderDocument.id, documentId))
			expect(document.status).toBe("pending")
			expect(document.reviewedAt).toBeNull()
		} finally {
			await db
				.delete(ProviderDocumentProcessingJob)
				.where(eq(ProviderDocumentProcessingJob.documentId, documentId))
			await db
				.delete(ProviderDocumentInspection)
				.where(eq(ProviderDocumentInspection.documentId, documentId))
			await db.delete(ProviderDocument).where(eq(ProviderDocument.id, documentId))
			const head = await getDocumentR2Client().send(
				new HeadObjectCommand({ Bucket: config.bucket, Key: object.objectKey })
			)
			if (
				!object.objectKey.startsWith(`provider-documents/${providerId}/`) ||
				head.Metadata?.sha256 !== integrity.sha256
			)
				throw new Error("unsafe_synthetic_cleanup")
			await getDocumentR2Client().send(
				new DeleteObjectCommand({ Bucket: config.bucket, Key: object.objectKey })
			)
		}
	},
	90_000
)
