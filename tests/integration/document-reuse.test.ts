import { afterAll, describe, expect, it, vi } from "vitest"
import { hasIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import { withPostgresTransaction, closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	db,
	eq,
	Provider,
	ProviderHolderProfile,
	User,
	ProviderDocument,
	DocumentDefinition,
	DocumentDefinitionVersion,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
	ComplianceCase,
	AuditEvent,
} from "@/shared/infrastructure/db/compat"
import { reuseProviderDocument } from "@/lib/documents/document-reuse"
import { buildProviderDocumentObjectKey } from "@/lib/provider-document-storage"

vi.mock("@/lib/documents/activation", () => ({ assertDocumentPipelineEnabled: () => undefined }))

async function fixture() {
	const suffix = crypto.randomUUID()
	const providerId = `reuse_provider_${suffix}`,
		actor = `reuse_reviewer_${suffix}`,
		sourceId = `reuse_source_${suffix}`
	await db.insert(User).values({ id: actor, email: `${actor}@fastt.test` })
	await db.insert(Provider).values({
		id: providerId,
		legalName: "Synthetic La Paz reuse",
		status: "inactive",
		accountPurpose: "integration_certification",
		dataClassification: "fixture",
	})
	await db
		.insert(ProviderHolderProfile)
		.values({
			providerId,
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: "BO",
			collectionModel: "property_collect",
		})
	const definitionId = crypto.randomUUID(),
		versionId = crypto.randomUUID()
	await db
		.insert(DocumentDefinition)
		.values({ id: definitionId, key: "bo.holder.personal_identity" })
	await db.insert(DocumentDefinitionVersion).values({
		id: versionId,
		definitionId,
		version: 1,
		status: "published",
		label: "Identidad sintética",
		description: "Solo certificación",
		family: "identity",
		captureJson: {
			version: 1,
			issuer: "required",
			issuedAt: "required",
			expiresAt: "optional",
			allowedSubjectTypes: ["person"],
			issuerCountries: [],
			requiredScopes: [],
		},
	})
	await db.insert(ProviderDocument).values({
		id: sourceId,
		providerId,
		type: "government_id",
		status: "verified",
		fileUrl: "local://certification/synthetic.pdf",
		expiresAt: new Date("2030-01-01"),
		reviewedBy: actor,
		reviewedAt: new Date(),
		metadataJson: {
			fileName: "synthetic.pdf",
			mimeType: "application/pdf",
			integrity: { synthetic: true },
		},
	})
	return {
		actor,
		sourceId,
		versionId,
		providerId,
		input: {
			providerId,
			documentId: sourceId,
			definitionVersionId: versionId,
			subjectType: "person",
			subjectReference: providerId,
			issuer: "Emisor sintético",
			issuedAt: "2026-01-01",
			expiresAt: "2030-01-01",
			reason: "Revisión sintética en La Paz",
		},
	}
}

async function scenario(work: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
	const rollback = new Error("ROLLBACK_DOCUMENT_REUSE_SCENARIO")
	await expect(
		withPostgresTransaction(async () => {
			await work(await fixture())
			throw rollback
		})
	).rejects.toBe(rollback)
}

describe.skipIf(!hasIsolatedTestDatabase())("La Paz synthetic document reuse", () => {
	afterAll(closePostgresClients)
	it("creates one pending review, inspection, job and case; preserves source approval", async () =>
		scenario(async (f) => {
			const result = await reuseProviderDocument(f.input, f.actor)
			expect(() =>
				buildProviderDocumentObjectKey({
					providerId: f.providerId,
					documentId: result.documentId,
					fileName: "original",
				})
			).not.toThrow()
			const repeated = await reuseProviderDocument(f.input, f.actor)
			expect(repeated).toEqual({ documentId: result.documentId, reused: true })
			const [created] = await db
				.select()
				.from(ProviderDocument)
				.where(eq(ProviderDocument.id, result.documentId))
			const [source] = await db
				.select()
				.from(ProviderDocument)
				.where(eq(ProviderDocument.id, f.sourceId))
			expect(created).toMatchObject({
				status: "pending",
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
				fileUrl: source.fileUrl,
				definitionVersionId: f.versionId,
				replacesDocumentId: null,
			})
			expect(source).toMatchObject({
				status: "verified",
				reviewedBy: f.actor,
				definitionVersionId: null,
				subjectType: "provider",
			})
			expect(created.metadataJson).toMatchObject({
				reusedFromDocumentId: f.sourceId,
				fileName: "synthetic.pdf",
				mimeType: "application/pdf",
			})
			expect(
				await db
					.select()
					.from(ProviderDocumentInspection)
					.where(eq(ProviderDocumentInspection.documentId, result.documentId))
			).toHaveLength(1)
			expect(
				await db
					.select()
					.from(ProviderDocumentProcessingJob)
					.where(eq(ProviderDocumentProcessingJob.documentId, result.documentId))
			).toHaveLength(1)
			expect(
				await db
					.select()
					.from(ComplianceCase)
					.where(eq(ComplianceCase.sourceRef, result.documentId))
			).toHaveLength(1)
			expect(
				await db.select().from(AuditEvent).where(eq(AuditEvent.entityId, result.documentId))
			).toHaveLength(1)
		}))
	it("rejects use of another provider's source", async () =>
		scenario(async (f) => {
			await expect(
				reuseProviderDocument({ ...f.input, providerId: "another-provider" }, f.actor)
			).rejects.toThrow("verified_document_required")
		}))
	it("does not accept a draft definition", async () =>
		scenario(async (f) => {
			const id = crypto.randomUUID()
			const [original] = await db
				.select()
				.from(DocumentDefinitionVersion)
				.where(eq(DocumentDefinitionVersion.id, f.versionId))
			await db
				.insert(DocumentDefinitionVersion)
				.values({ ...original, id, version: 2, status: "draft" })
			await expect(
				reuseProviderDocument({ ...f.input, definitionVersionId: id }, f.actor)
			).rejects.toThrow("document_definition_not_published")
		}))
})
