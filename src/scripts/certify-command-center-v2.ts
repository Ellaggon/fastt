import { closePostgresClients } from "@/shared/infrastructure/db/client"
import {
	and,
	asc,
	AuditEvent,
	CaseActivityEvent,
	CaseDecision,
	CommandIdempotency,
	ComplianceCase,
	db,
	eq,
	inArray,
	Provider,
	ProviderDocument,
	ProviderPaymentAccount,
	ProviderTaxConfiguration,
	ProviderVerification,
} from "@/shared/infrastructure/db/compat"
import { synchronizeComplianceCase } from "@/lib/casework/compliance-casework"
import { uploadProviderDocumentObject } from "@/lib/provider-document-storage"

/**
 * Production-safe fixture for certifying the Casework V2 decision path.
 *
 * This deliberately never targets a commercial provider and is opt-in on
 * purpose: `CONFIRM_COMMAND_CENTER_V2_CERTIFICATION=prepare` is required to
 * write. The resulting four cases must be decided through the admin UI so the
 * normal IAM, MFA, idempotency and audit boundaries are exercised.
 */
const APPLY = process.argv.includes("--apply")
const VERIFY = process.argv.includes("--verify")
const ATTACH_DOCUMENT = process.argv.includes("--attach-document")
const CONFIRMED = process.env.CONFIRM_COMMAND_CENTER_V2_CERTIFICATION === "prepare"
const ATTACHMENT_CONFIRMED =
	process.env.CONFIRM_COMMAND_CENTER_V2_CERTIFICATION === "attach_document"

const PROVIDER_ID = "provider_command_center_v2_certification"
const DOCUMENT_ID = "document_command_center_v2_certification"
const PAYMENT_ACCOUNT_ID = "payment_command_center_v2_certification"

const fixtureCases = [
	{
		domain: "verification" as const,
		sourceType: "ProviderVerification",
		sourceRef: PROVIDER_ID,
		summary: "Certificación controlada V2: identidad y negocio",
	},
	{
		domain: "fiscal" as const,
		sourceType: "ProviderTaxConfiguration",
		sourceRef: PROVIDER_ID,
		summary: "Certificación controlada V2: identidad fiscal",
	},
	{
		domain: "documents" as const,
		sourceType: "ProviderDocument",
		sourceRef: DOCUMENT_ID,
		summary: "Certificación controlada V2: documento mercantil",
	},
	{
		domain: "payments" as const,
		sourceType: "ProviderPaymentAccount",
		sourceRef: PAYMENT_ACCOUNT_ID,
		summary: "Certificación controlada V2: cuenta de payout",
	},
]

function assertion(condition: unknown, code: string): asserts condition {
	if (!condition) throw new Error(code)
}

function certificationPdf() {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		"<< /Length 82 >>\nstream\nBT /F1 16 Tf 72 720 Td (FASTT Command Center V2 - certification fixture) Tj ET\nendstream",
	]
	let output = "%PDF-1.4\n"
	const offsets = [0]
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(output, "utf8"))
		output += `${index + 1} 0 obj\n${object}\nendobj\n`
	}
	const xrefOffset = Buffer.byteLength(output, "utf8")
	output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`
	output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
	return Buffer.from(output, "utf8")
}

async function attachDocument() {
	assertion(ATTACHMENT_CONFIRMED, "CERTIFICATION_ATTACHMENT_CONFIRMATION_REQUIRED")
	const [document] = await db
		.select({
			id: ProviderDocument.id,
			status: ProviderDocument.status,
			metadataJson: ProviderDocument.metadataJson,
		})
		.from(ProviderDocument)
		.where(and(eq(ProviderDocument.id, DOCUMENT_ID), eq(ProviderDocument.providerId, PROVIDER_ID)))
	assertion(document, "CERTIFICATION_DOCUMENT_MISSING")
	assertion(document.status === "pending", "CERTIFICATION_DOCUMENT_NOT_PENDING")
	const fileName = "fastt-command-center-v2-certification.pdf"
	const uploaded = await uploadProviderDocumentObject({
		providerId: PROVIDER_ID,
		documentId: DOCUMENT_ID,
		fileName,
		mimeType: "application/pdf",
		body: certificationPdf(),
	})
	await db
		.update(ProviderDocument)
		.set({
			fileUrl: uploaded.fileUrl,
			metadataJson: {
				...(typeof document.metadataJson === "object" && document.metadataJson
					? document.metadataJson
					: {}),
				fileName,
				mimeType: "application/pdf",
				sizeBytes: certificationPdf().byteLength,
				fixture: "command_center_v2",
				containsCustomerData: false,
			},
			updatedAt: new Date(),
		})
		.where(eq(ProviderDocument.id, DOCUMENT_ID))
	console.log(
		JSON.stringify(
			{
				attached: true,
				providerId: PROVIDER_ID,
				documentId: DOCUMENT_ID,
				fileUrl: uploaded.fileUrl,
			},
			null,
			2
		)
	)
}

async function prepare() {
	assertion(CONFIRMED, "CERTIFICATION_CONFIRMATION_REQUIRED")
	const now = new Date()

	await db
		.insert(Provider)
		.values({
			id: PROVIDER_ID,
			legalName: "FASTT Command Center V2 Certification",
			displayName: "FASTT · Certificación Casework V2",
			status: "inactive",
			accountPurpose: "integration_certification",
			dataClassification: "fixture",
			createdAt: now,
		})
		.onConflictDoNothing()

	await db
		.insert(ProviderVerification)
		.values({
			id: `verification_${PROVIDER_ID}`,
			providerId: PROVIDER_ID,
			status: "pending",
			reason: "Fixture controlado para certificar Casework V2",
			metadataJson: { fixture: "command_center_v2", containsCustomerData: false },
			createdAt: now,
		})
		.onConflictDoNothing()

	await db
		.insert(ProviderTaxConfiguration)
		.values({
			providerId: PROVIDER_ID,
			status: "pending",
			taxResidenceCountry: "BO",
			businessRegistrationNumber: "FASTT-QA-V2-ONLY",
			taxRegime: "certification_fixture",
			invoicingMode: "platform_receipt",
			metadataJson: { fixture: "command_center_v2", containsCustomerData: false },
			updatedAt: now,
		})
		.onConflictDoNothing()

	await db
		.insert(ProviderDocument)
		.values({
			id: DOCUMENT_ID,
			providerId: PROVIDER_ID,
			type: "business_registration",
			status: "pending",
			fileUrl: "local://certification-fixtures/command-center-v2/business-registration.pdf",
			metadataJson: {
				fileName: "fastt-command-center-v2-fixture.pdf",
				mimeType: "application/pdf",
				sizeBytes: 1024,
				fixture: "command_center_v2",
				containsCustomerData: false,
			},
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()

	await db
		.insert(ProviderPaymentAccount)
		.values({
			id: PAYMENT_ACCOUNT_ID,
			providerId: PROVIDER_ID,
			status: "pending",
			provider: "bank_transfer",
			currency: "BOB",
			accountHolderName: "FASTT Command Center V2 Certification",
			bankName: "Banco de Pruebas",
			country: "BO",
			accountNumberLast4: "0000",
			accountReference: "masked:0000",
			payoutSchedule: "manual",
			metadataJson: { fixture: "command_center_v2", containsCustomerData: false },
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()

	const cases = []
	for (const fixture of fixtureCases) {
		cases.push(
			await synchronizeComplianceCase({
				providerId: PROVIDER_ID,
				...fixture,
			})
		)
	}

	console.log(
		JSON.stringify(
			{
				prepared: true,
				providerId: PROVIDER_ID,
				providerPurpose: "integration_certification",
				dataClassification: "fixture",
				cases,
			},
			null,
			2
		)
	)
}

async function verify() {
	const cases = await db
		.select({
			id: ComplianceCase.id,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			resolutionCode: ComplianceCase.resolutionCode,
			version: ComplianceCase.version,
		})
		.from(ComplianceCase)
		.where(eq(ComplianceCase.providerId, PROVIDER_ID))
		.orderBy(asc(ComplianceCase.domain))

	assertion(cases.length === fixtureCases.length, "CERTIFICATION_CASES_MISSING")
	const decisionRows = await db
		.select({
			caseId: CaseDecision.caseId,
			status: CaseDecision.status,
			decision: CaseDecision.decision,
		})
		.from(CaseDecision)
		.where(
			inArray(
				CaseDecision.caseId,
				cases.map((item) => item.id)
			)
		)
	const activityRows = await db
		.select({ caseId: CaseActivityEvent.caseId, eventType: CaseActivityEvent.eventType })
		.from(CaseActivityEvent)
		.where(
			inArray(
				CaseActivityEvent.caseId,
				cases.map((item) => item.id)
			)
		)
	const auditRows = await db
		.select({
			entityId: AuditEvent.entityId,
			outcome: AuditEvent.outcome,
			requestId: AuditEvent.requestId,
		})
		.from(AuditEvent)
		.where(
			and(
				eq(AuditEvent.action, "case.decision.propose"),
				inArray(
					AuditEvent.entityId,
					cases.map((item) => item.id)
				)
			)
		)
	const idempotencyRows = await db
		.select({
			scope: CommandIdempotency.scope,
			status: CommandIdempotency.status,
			requestId: CommandIdempotency.requestId,
		})
		.from(CommandIdempotency)
		.where(eq(CommandIdempotency.scope, "case.decision.propose"))
	const [verification] = await db
		.select({ status: ProviderVerification.status })
		.from(ProviderVerification)
		.where(eq(ProviderVerification.id, `verification_${PROVIDER_ID}`))
	const [fiscal] = await db
		.select({ status: ProviderTaxConfiguration.status })
		.from(ProviderTaxConfiguration)
		.where(eq(ProviderTaxConfiguration.providerId, PROVIDER_ID))
	const [document] = await db
		.select({ status: ProviderDocument.status })
		.from(ProviderDocument)
		.where(eq(ProviderDocument.id, DOCUMENT_ID))
	const [payment] = await db
		.select({ status: ProviderPaymentAccount.status })
		.from(ProviderPaymentAccount)
		.where(eq(ProviderPaymentAccount.id, PAYMENT_ACCOUNT_ID))
	const canonicalStatus = {
		verification: verification?.status,
		fiscal: fiscal?.status,
		documents: document?.status,
		payments: payment?.status,
	}
	const canonicalWasUpdated = (domain: string, status: string | undefined) =>
		(domain === "verification" && ["approved", "rejected"].includes(String(status))) ||
		(domain === "fiscal" && ["verified", "requires_attention"].includes(String(status))) ||
		(domain === "documents" && ["verified", "rejected"].includes(String(status))) ||
		(domain === "payments" && ["verified", "requires_attention"].includes(String(status)))

	const result = cases.map((item) => {
		const decisions = decisionRows.filter((row) => row.caseId === item.id)
		const activities = activityRows
			.filter((row) => row.caseId === item.id)
			.map((row) => row.eventType)
		const audits = auditRows.filter((row) => row.entityId === item.id).map((row) => row.outcome)
		const requestIds = auditRows
			.filter((row) => row.entityId === item.id && row.outcome === "succeeded")
			.map((row) => row.requestId)
		return {
			...item,
			decisionApplied: decisions.some((row) => row.status === "applied"),
			canonicalResolution: item.status === "resolved",
			canonicalSourceStatus: canonicalStatus[item.domain as keyof typeof canonicalStatus] ?? null,
			canonicalSourceUpdated: canonicalWasUpdated(
				item.domain,
				canonicalStatus[item.domain as keyof typeof canonicalStatus]
			),
			activityApplied: activities.includes("decision_applied"),
			auditAttempted: audits.includes("attempted"),
			auditSucceeded: audits.includes("succeeded"),
			idempotencyReserved: idempotencyRows.some(
				(row) => row.status === "succeeded" && requestIds.includes(row.requestId)
			),
		}
	})
	const passed = result.every(
		(item) =>
			item.decisionApplied &&
			item.canonicalResolution &&
			item.canonicalSourceUpdated &&
			item.activityApplied &&
			item.auditAttempted &&
			item.auditSucceeded &&
			item.idempotencyReserved
	)
	console.log(
		JSON.stringify(
			{
				passed,
				providerId: PROVIDER_ID,
				cases: result,
				idempotencyReservations: idempotencyRows.length,
			},
			null,
			2
		)
	)
	if (!passed) process.exitCode = 1
}

try {
	if (Number(APPLY) + Number(VERIFY) + Number(ATTACH_DOCUMENT) !== 1)
		throw new Error("Use exactly one of --apply, --attach-document or --verify")
	if (APPLY) await prepare()
	else if (ATTACH_DOCUMENT) await attachDocument()
	else await verify()
} finally {
	await closePostgresClients()
}
