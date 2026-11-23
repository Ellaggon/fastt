import { randomUUID } from "node:crypto"
import { makeMixedPdf } from "../../services/document-analysis/fixtures/mixed-pdf.mjs"
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { afterEach, expect, it, vi } from "vitest"
afterEach(() => vi.unstubAllEnvs())
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
		vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "true")
		vi.stubEnv("DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT", "true")
		if (
			process.env.FASTT_DATA_ENV !== "test" ||
			!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(process.env.FASTT_TEST_S3_ENDPOINT ?? "") ||
			!/^http:\/\/127\.0\.0\.1:\d+\/v1\/documents\/analyze$/.test(
				process.env.DOCUMENT_ANALYSIS_GATEWAY_URL ?? ""
			)
		)
			throw new Error("isolated_local_certification_required")
		const providerId = `gateway-worker-certification-${randomUUID()}`,
			idempotencyKey = randomUUID(),
			documentId = documentSubmissionId(providerId, idempotencyKey)
		const bytes = makeMixedPdf()
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
			const inspection = await getProviderDocumentInspection(documentId)
			expect(result.completed, inspection?.errorCode ?? "No inspection error recorded").toBe(1)
			expect(inspection).toMatchObject({
				processingState: "completed",
				malwareStatus: "clean",
				ocrStatus: "completed",
				extractionStatus: "completed",
				sha256: integrity.sha256,
			})
			const [stored] = await db
				.select({ fields: ProviderDocumentInspection.extractedFieldsJson })
				.from(ProviderDocumentInspection)
				.where(eq(ProviderDocumentInspection.documentId, documentId))
			expect(stored?.fields).toEqual([
				{ key: "issuer", value: "Autoridad sintetica", page: 1 },
				{ key: "issued_at", value: "2026-11-14", page: 2 },
			])
			expect(documentInspectionGate(inspection)).toMatchObject({ canReveal: true, blockers: [] })
			expect(documentInspectionGate(inspection).warnings).toEqual([])
			const [document] = await db
				.select()
				.from(ProviderDocument)
				.where(eq(ProviderDocument.id, documentId))
			expect(document.status).toBe("pending")
			expect(document.reviewedAt).toBeNull()

			const storage = getDocumentR2Client()
			const legacyKey = object.objectKey.replace(/\/original$/, "/legacy.pdf")
			await storage.send(
				new PutObjectCommand({
					Bucket: config.bucket,
					Key: legacyKey,
					Body: bytes,
					ContentType: "application/pdf",
				})
			)
			try {
				await storage.send(
					new DeleteObjectCommand({ Bucket: config.bucket, Key: object.objectKey })
				)
				const legacyRef = `r2-documents:${legacyKey}`
				await db
					.update(ProviderDocument)
					.set({ fileUrl: legacyRef })
					.where(eq(ProviderDocument.id, documentId))
				await db
					.update(ProviderDocumentProcessingJob)
					.set({ status: "queued", availableAt: new Date() })
					.where(eq(ProviderDocumentProcessingJob.documentId, documentId))
				const retry = await runProviderDocumentProcessingWorker({
					limit: 1,
					target: { providerId, documentId },
				})
				const retried = await getProviderDocumentInspection(documentId)
				expect(retry.completed, retried?.errorCode ?? "No inspection error recorded").toBe(1)
				expect(retried).toMatchObject({
					sha256: integrity.sha256,
					malwareStatus: "clean",
					extractionStatus: "completed",
				})
				const [preserved] = await db
					.select()
					.from(ProviderDocument)
					.where(eq(ProviderDocument.id, documentId))
				expect(preserved).toMatchObject({ fileUrl: legacyRef, status: "pending", reviewedAt: null })
				expect(
					(await storage.send(new HeadObjectCommand({ Bucket: config.bucket, Key: legacyKey })))
						.ContentLength
				).toBe(bytes.length)
			} finally {
				await storage.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: legacyKey }))
			}
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
