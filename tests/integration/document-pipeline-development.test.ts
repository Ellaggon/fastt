import { afterAll, afterEach, expect, it, vi } from "vitest"
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { makeMixedPdf } from "../../services/document-analysis/fixtures/mixed-pdf.mjs"
import { getDocumentR2Client } from "@/container/shared.container"
import {
	db,
	eq,
	Provider,
	User,
	ProviderUser,
	ProviderHolderProfile,
	ProviderDocument,
	ProviderAuditLog,
} from "@/shared/infrastructure/db/compat"
import { withPostgresTransaction, closePostgresClients } from "@/shared/infrastructure/db/client"
import { hasIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import {
	createDocumentDefinitionDraft,
	transitionDocumentDefinition,
} from "@/lib/documents/document-definitions"
import { territorialRedesignDefinitions } from "@/lib/commercial-policy/territorial-redesign"
import {
	createDirectDocumentUpload,
	confirmDirectDocumentUpload,
	buildProviderDocumentObjectKey,
} from "@/lib/provider-document-storage"
import { documentSubmissionId } from "@/lib/documents/upload-contract"
import { submitProviderDocument, reviewProviderDocument } from "@/lib/provider-documents"
import {
	runProviderDocumentProcessingWorker,
	getProviderDocumentInspection,
	documentInspectionGate,
} from "@/lib/documents/document-processing"

afterEach(() => vi.unstubAllEnvs())
afterAll(closePostgresClients)

it.skipIf(process.env.FASTT_CERTIFY_DOCUMENT_R2_DEVELOPMENT !== "1")(
	"certifies synthetic direct upload, real local analysis and human-review command with isolated PostgreSQL",
	async () => {
		if (
			!hasIsolatedTestDatabase() ||
			process.env.FASTT_DATA_ENV !== "test" ||
			!["http://127.0.0.1:4319", "http://127.0.0.1:4329"].includes(new URL(process.env.DOCUMENT_ANALYSIS_GATEWAY_URL ?? "https://invalid").origin) ||
			process.env.FASTT_TEST_S3_ENDPOINT
		)
			throw new Error("isolated_database_and_development_gateway_required")
		vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "true")
		vi.stubEnv("DOCUMENT_ANALYSIS_LOCAL_DEVELOPMENT", "true")
		const config = documentStorageConfig()
		if (!config) throw new Error("private_document_storage_required")
		const suffix = crypto.randomUUID(),
			providerId = `pipeline-certification-${suffix}`,
			owner = `pipeline-owner-${suffix}`,
			reviewer = `pipeline-reviewer-${suffix}`,
			idempotencyKey = crypto.randomUUID(),
			documentId = documentSubmissionId(providerId, idempotencyKey)
		const bytes = makeMixedPdf(),
			integrity = documentIntegrity(bytes, "application/pdf")
		const upload = {
			idempotencyKey,
			fileName: "synthetic.pdf",
			mimeType: "application/pdf",
			sizeBytes: bytes.length,
			sha256: integrity.sha256,
		}
		const objectKey = buildProviderDocumentObjectKey({
			providerId,
			documentId,
			fileName: upload.fileName,
		})
		let uploaded = false
		const rollback = new Error("ROLLBACK_SYNTHETIC_DOCUMENT_PIPELINE")
		try {
			await expect(
				withPostgresTransaction(async () => {
					await db
						.insert(User)
						.values([owner, reviewer].map((id) => ({ id, email: `${id}@fastt.test` })))
					await db.insert(Provider).values({
						id: providerId,
						legalName: "Synthetic national identity certification",
						status: "inactive",
						dataClassification: "fixture",
						accountPurpose: "integration_certification",
					})
					await db
						.insert(ProviderUser)
						.values({ id: crypto.randomUUID(), providerId, userId: owner, role: "owner" })
					await db
						.insert(ProviderHolderProfile)
						.values({
							providerId,
							holderType: "persona_natural",
							holderCountry: "BO",
							taxResidenceCountry: "BO",
							collectionModel: "property_collect",
						})
					const definition = await createDocumentDefinitionDraft(
						territorialRedesignDefinitions().find((d) => d.key === "bo.holder.personal_identity")
					)
					await transitionDocumentDefinition(definition.id, "publish")
					const signed = await createDirectDocumentUpload(providerId, upload)
					const put = await fetch(signed.signedUrl, {
						method: "PUT",
						headers: signed.headers,
						body: bytes,
						redirect: "error",
						signal: AbortSignal.timeout(30000),
					})
					if (!put.ok) throw new Error(`synthetic_upload_failed_${put.status}`)
					uploaded = true
					const confirmed = await confirmDirectDocumentUpload(providerId, upload)
					expect(confirmed.bytes).toEqual(bytes)
					const input = {
						providerId,
						actorUserId: owner,
						type: "government_id",
						definitionVersionId: definition.id,
						idempotencyKey,
						fileName: upload.fileName,
						mimeType: upload.mimeType,
						sizeBytes: bytes.length,
						fileBytes: confirmed.bytes,
						directUploadVerified: true,
						evidence: {
							issuer: "Autoridad sintética",
							issuedAt: "2026-01-01",
							expiresAt: "2030-01-01",
							subjectType: "person",
							subjectReference: providerId,
						},
					}
					const submitted = await submitProviderDocument(input)
					expect(submitted.id).toBe(documentId)
					expect((await submitProviderDocument(input)).id).toBe(documentId)
					await expect(
						reviewProviderDocument({
							providerId,
							actorUserId: reviewer,
							documentId,
							status: "verified",
							reviewNotes: "Synthetic certification only",
						})
					).rejects.toThrow(/document_(preview_required|processing_gate_blocked)/)
					const processed = await runProviderDocumentProcessingWorker({
						limit: 1,
						target: { providerId, documentId },
					})
					const inspection = await getProviderDocumentInspection(documentId)
					expect(processed.completed, inspection?.errorCode ?? "inspection_missing").toBe(1)
					expect(inspection).toMatchObject({
						processingState: "completed",
						structuralStatus: "valid",
						malwareStatus: "clean",
						ocrStatus: "completed",
						sha256: integrity.sha256,
					})
					expect(documentInspectionGate(inspection).blockers).toEqual([])
					let [document] = await db
						.select()
						.from(ProviderDocument)
						.where(eq(ProviderDocument.id, documentId))
					expect(document.status).toBe("pending")
					expect(document.reviewedAt).toBeNull()
					await reviewProviderDocument({
						providerId,
						actorUserId: reviewer,
						documentId,
						status: "verified",
						reviewNotes:
							"Synthetic national identity workflow certification; not a real identity approval",
					})
					;[document] = await db
						.select()
						.from(ProviderDocument)
						.where(eq(ProviderDocument.id, documentId))
					expect(document).toMatchObject({
						status: "verified",
						reviewedBy: reviewer,
						definitionVersionId: definition.id,
						subjectType: "person",
						subjectReference: providerId,
					})
					expect(
						await db
							.select()
							.from(ProviderAuditLog)
							.where(eq(ProviderAuditLog.entityId, documentId))
					).not.toHaveLength(0)
					throw rollback
				})
			).rejects.toBe(rollback)
			expect(
				await db.select().from(ProviderDocument).where(eq(ProviderDocument.id, documentId))
			).toHaveLength(0)
		} finally {
			if (uploaded) {
				const client = getDocumentR2Client()
				const head = await client.send(
					new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey })
				)
				if (
					!objectKey.startsWith(`provider-documents/${providerId}/`) ||
					head.Metadata?.sha256 !== integrity.sha256
				)
					throw new Error("unsafe_synthetic_cleanup")
				await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
			}
		}
	},
	120000
)
