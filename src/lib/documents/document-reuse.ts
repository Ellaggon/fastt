import { createHash } from "node:crypto"
import {
	db,
	eq,
	sql,
	Provider,
	ProviderDocument,
	DocumentDefinition,
	DocumentDefinitionVersion,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
	AuditEvent,
} from "@/shared/infrastructure/db/compat"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { synchronizeComplianceCaseCompat } from "@/lib/casework/compliance-casework"
import { assertDocumentPipelineEnabled } from "@/lib/documents/activation"
import { documentReuseSchema, validateDocumentReuse } from "./document-reuse-contract"
import {
	assertEvidenceScopeBelongsToProvider,
	validateProviderDocumentEvidence,
} from "@/lib/provider-documents"

/** The HTTP caller must enforce provider.document.review and recent MFA. */
export async function reuseProviderDocument(raw: unknown, actorUserId: string) {
	assertDocumentPipelineEnabled()
	const input = documentReuseSchema.parse(raw)
	const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex")
	const id = `reuse_${createHash("sha256")
		.update(
			JSON.stringify({
				providerId: input.providerId,
				documentId: input.documentId,
				definitionVersionId: input.definitionVersionId,
				subjectType: input.subjectType,
				subjectReference: input.subjectReference,
			})
		)
		.digest("hex")}`
	return withPostgresTransaction(async () => {
		await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`)
		const [source] = await db
			.select()
			.from(ProviderDocument)
			.where(eq(ProviderDocument.id, input.documentId))
			.for("update")
		const [provider] = await db
			.select({ status: Provider.status })
			.from(Provider)
			.where(eq(Provider.id, input.providerId))
			.for("share")
		if (!source || !provider || provider.status === "archived")
			throw new Error("verified_document_required")
		await db.execute(
			sql`SELECT id FROM "DocumentDefinitionVersion" WHERE id=${input.definitionVersionId} FOR SHARE`
		)
		const [definition] = await db
			.select({
				key: DocumentDefinition.key,
				family: DocumentDefinitionVersion.family,
				status: DocumentDefinitionVersion.status,
				captureJson: DocumentDefinitionVersion.captureJson,
			})
			.from(DocumentDefinitionVersion)
			.innerJoin(
				DocumentDefinition,
				eq(DocumentDefinition.id, DocumentDefinitionVersion.definitionId)
			)
			.where(eq(DocumentDefinitionVersion.id, input.definitionVersionId))
		if (!definition) throw new Error("document_definition_not_published")
		validateDocumentReuse(input, source, definition)
		await assertEvidenceScopeBelongsToProvider(
			input.providerId,
			validateProviderDocumentEvidence(input),
			undefined,
			definition.key
		)
		const [existing] = await db
			.select({ id: ProviderDocument.id, metadataJson: ProviderDocument.metadataJson })
			.from(ProviderDocument)
			.where(eq(ProviderDocument.id, id))
		if (existing) {
			if (
				(existing.metadataJson as Record<string, unknown> | null)?.reuseFingerprint !== fingerprint
			)
				throw new Error("document_reuse_review_already_exists")
			return { documentId: existing.id, reused: true }
		}
		const metadata =
			source.metadataJson && typeof source.metadataJson === "object"
				? (source.metadataJson as Record<string, unknown>)
				: {}
		await db.insert(ProviderDocument).values({
			id,
			providerId: input.providerId,
			type: source.type,
			definitionVersionId: input.definitionVersionId,
			status: "pending",
			fileUrl: source.fileUrl,
			issuer: input.issuer,
			issuedAt: input.issuedAt,
			expiresAt: input.expiresAt,
			subjectType: input.subjectType,
			subjectReference: input.subjectReference,
			metadataJson: {
				reuseFingerprint: fingerprint,
				reusedFromDocumentId: source.id,
				reuseReason: input.reason,
				fileName: metadata.fileName,
				mimeType: metadata.mimeType,
				sizeBytes: metadata.sizeBytes,
				integrity: metadata.integrity,
			},
			reviewedAt: null,
			reviewedBy: null,
			reviewNotes: null,
		})
		await db
			.insert(ProviderDocumentInspection)
			.values({ id, documentId: id, providerId: input.providerId, processingState: "queued" })
		await db.insert(ProviderDocumentProcessingJob).values({
			id: `document-processing:${id}`,
			documentId: id,
			status: "queued",
			availableAt: new Date(),
		})
		await synchronizeComplianceCaseCompat({
			providerId: input.providerId,
			domain: "documents",
			sourceType: "ProviderDocument",
			sourceRef: id,
			summary: "Revisión de respaldo existente",
		})
		await db.insert(AuditEvent).values({
			id: crypto.randomUUID(),
			requestId: crypto.randomUUID(),
			actorUserId,
			action: "provider.document.reuse_requested",
			entityType: "ProviderDocument",
			entityId: id,
			riskLevel: "high",
			afterJson: {
				sourceDocumentId: source.id,
				definitionVersionId: input.definitionVersionId,
				status: "pending",
				reason: input.reason,
			},
		})
		return { documentId: id, reused: false }
	})
}
