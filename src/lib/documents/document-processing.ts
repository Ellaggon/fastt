import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"

import { getFeatureFlag } from "@/config/featureFlags"
import {
	createProviderDocumentProcessingUrl,
	readProviderDocumentObject,
} from "@/lib/provider-document-storage"
import {
	and,
	db,
	eq,
	inArray,
	lt,
	lte,
	ProviderDocument,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
	sql,
} from "@/shared/infrastructure/db/compat"

const MAX_ATTEMPTS = 5
const LEASE_MS = 10 * 60 * 1000
const PERMANENT_SOURCE_ERRORS = new Set([
	"document_processing_source_missing",
	"document_processing_source_unavailable",
	"document_processing_source_empty",
	"document_processing_source_too_large",
	"document_format_not_recognized",
])

const gatewaySchema = z.object({
	malware: z.object({
		status: z.enum(["clean", "infected", "error"]),
		engine: z.string().min(1).max(80),
		definitionVersion: z.string().max(120).nullable().optional(),
	}),
	ocr: z.object({
		status: z.enum(["completed", "not_supported", "error"]),
		provider: z.string().min(1).max(80),
		language: z.string().max(24).nullable().optional(),
		confidence: z.number().min(0).max(1).nullable().optional(),
	}),
	extraction: z.object({
		status: z.enum(["completed", "not_supported", "error"]),
		fields: z
			.array(
				z.object({
					key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
					value: z.string().max(500),
					confidence: z.number().min(0).max(1).nullable().optional(),
				})
			)
			.max(40),
	}),
	tamper: z.object({
		status: z.enum(["clear", "suspected", "inconclusive", "error"]),
		signals: z.array(z.string().max(120)).max(30),
	}),
	qualitySignals: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export type ProviderDocumentInspectionReadModel = {
	processingState: string
	structuralStatus: string
	malwareStatus: string
	ocrStatus: string
	extractionStatus: string
	tamperStatus: string
	detectedMimeType: string | null
	sha256: string | null
	ocrConfidence: number | null
	extractedFieldKeys: string[]
	errorCode: string | null
	updatedAt: Date
}

function detectMime(bytes: Buffer): string | null {
	if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf"
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
		return "image/png"
	return null
}

export function inspectDocumentStructure(bytes: Buffer, declaredMimeType?: string | null) {
	const detectedMimeType = detectMime(bytes)
	const mimeMatches = Boolean(
		detectedMimeType && (!declaredMimeType || declaredMimeType === detectedMimeType)
	)
	const signals: string[] = []
	let structuralStatus: "valid" | "suspicious" | "invalid" = detectedMimeType ? "valid" : "invalid"
	if (!mimeMatches) signals.push("declared_mime_mismatch")
	if (detectedMimeType === "application/pdf") {
		const tail = bytes.subarray(Math.max(0, bytes.byteLength - 2048)).toString("latin1")
		if (!tail.includes("%%EOF")) {
			structuralStatus = "invalid"
			signals.push("pdf_eof_missing")
		}
		const sample = bytes.toString("latin1")
		for (const [pattern, code] of [
			[/\/JavaScript\b|\/JS\b/i, "pdf_javascript"],
			[/\/OpenAction\b/i, "pdf_open_action"],
			[/\/Launch\b/i, "pdf_launch_action"],
			[/\/EmbeddedFile\b/i, "pdf_embedded_file"],
			[/\/XFA\b/i, "pdf_xfa_form"],
		] as const)
			if (pattern.test(sample)) signals.push(code)
		if (structuralStatus === "valid" && signals.some((item) => item.startsWith("pdf_")))
			structuralStatus = "suspicious"
	}
	if (!mimeMatches && structuralStatus === "valid") structuralStatus = "invalid"
	return {
		detectedMimeType,
		structuralStatus,
		tamperStatus: structuralStatus === "suspicious" ? "suspected" : "inconclusive",
		signals,
		qualitySignals: { byteSize: bytes.byteLength, mimeMatches },
	}
}

async function callDocumentGateway(params: {
	documentId: string
	documentType: string
	fileUrl: string
	sha256: string
	detectedMimeType: string
	allowExternalGateway: boolean
}) {
	if (!params.allowExternalGateway) return null
	const endpoint = String(process.env.DOCUMENT_ANALYSIS_GATEWAY_URL ?? "").trim()
	const token = String(process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN ?? "").trim()
	if (!endpoint || !token) return null
	const sourceUrl = await createProviderDocumentProcessingUrl({
		fileUrl: params.fileUrl,
		expiresInSeconds: 300,
	})
	if (!sourceUrl) throw new Error("document_gateway_source_url_unavailable")
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
			"Idempotency-Key": `document-analysis:${params.documentId}:${params.sha256}`,
		},
		body: JSON.stringify({
			documentId: params.documentId,
			documentType: params.documentType,
			sourceUrl,
			sha256: params.sha256,
			mimeType: params.detectedMimeType,
			controls: ["malware", "ocr", "field_extraction", "tamper"],
		}),
		signal: AbortSignal.timeout(45_000),
	})
	if (!response.ok) throw new Error(`document_gateway_http_${response.status}`)
	return gatewaySchema.parse(await response.json())
}

export async function getProviderDocumentInspection(
	documentId: string
): Promise<ProviderDocumentInspectionReadModel | null> {
	const [row] = await db
		.select()
		.from(ProviderDocumentInspection)
		.where(eq(ProviderDocumentInspection.documentId, documentId))
		.limit(1)
	if (!row) return null
	const fields = Array.isArray(row.extractedFieldsJson) ? row.extractedFieldsJson : []
	return {
		processingState: row.processingState,
		structuralStatus: row.structuralStatus,
		malwareStatus: row.malwareStatus,
		ocrStatus: row.ocrStatus,
		extractionStatus: row.extractionStatus,
		tamperStatus: row.tamperStatus,
		detectedMimeType: row.detectedMimeType,
		sha256: row.sha256,
		ocrConfidence: row.ocrConfidence == null ? null : Number(row.ocrConfidence),
		extractedFieldKeys: fields
			.map((field) => (field && typeof field === "object" ? String(field.key ?? "") : ""))
			.filter(Boolean),
		errorCode: row.errorCode,
		updatedAt: row.updatedAt,
	}
}

export function documentInspectionGate(
	inspection: ProviderDocumentInspectionReadModel | null,
	options: { enforced?: boolean } = {}
) {
	const enforced = options.enforced ?? getFeatureFlag("DOCUMENT_PROCESSING_ENFORCED")
	const blockers: string[] = []
	const warnings: string[] = []
	if (!inspection) {
		;(enforced ? blockers : warnings).push(
			"El documento aún no tiene inspección técnica registrada."
		)
		return { blockers, warnings, canReveal: !enforced }
	}
	if (inspection.structuralStatus === "invalid")
		blockers.push("El contenido real no corresponde a un archivo estructuralmente válido.")
	if (inspection.structuralStatus === "suspicious" || inspection.tamperStatus === "suspected")
		blockers.push("El archivo presenta señales de contenido activo o posible manipulación.")
	if (inspection.malwareStatus === "infected")
		blockers.push("El antivirus detectó contenido malicioso; el archivo permanece en cuarentena.")
	if (inspection.malwareStatus !== "clean" && inspection.malwareStatus !== "infected") {
		;(enforced ? blockers : warnings).push(
			"El análisis antivirus todavía no confirmó que el archivo esté limpio."
		)
	}
	if (inspection.ocrStatus !== "completed")
		warnings.push("OCR no completado; la revisión manual debe justificar cualquier aprobación.")
	if (inspection.extractionStatus !== "completed")
		warnings.push("La extracción automática de campos no está disponible o está incompleta.")
	return {
		blockers,
		warnings,
		canReveal:
			!blockers.length &&
			(!enforced || inspection.malwareStatus === "clean") &&
			inspection.structuralStatus !== "invalid",
	}
}

export async function assertProviderDocumentSafeToReveal(documentId: string) {
	const inspection = await getProviderDocumentInspection(documentId)
	const gate = documentInspectionGate(inspection)
	if (!gate.canReveal) {
		const error = new Error("document_quarantined")
		;(error as Error & { status?: number }).status = 423
		throw error
	}
}

async function processJob(
	job: { id: string; documentId: string; attempts: number },
	workerId: string,
	allowExternalGateway: boolean
) {
	const now = new Date()
	const claimed = await db
		.update(ProviderDocumentProcessingJob)
		.set({ status: "processing", lockedAt: now, lockedBy: workerId, updatedAt: now })
		.where(
			and(
				eq(ProviderDocumentProcessingJob.id, job.id),
				inArray(ProviderDocumentProcessingJob.status, ["queued", "retry"])
			)
		)
		.returning({ id: ProviderDocumentProcessingJob.id })
	if (!claimed[0]) return "skipped" as const
	await db
		.update(ProviderDocumentInspection)
		.set({ processingState: "processing", startedAt: now, errorCode: null, updatedAt: now })
		.where(eq(ProviderDocumentInspection.documentId, job.documentId))
	try {
		const [document] = await db
			.select({
				id: ProviderDocument.id,
				type: ProviderDocument.type,
				fileUrl: ProviderDocument.fileUrl,
				metadataJson: ProviderDocument.metadataJson,
			})
			.from(ProviderDocument)
			.where(eq(ProviderDocument.id, job.documentId))
			.limit(1)
		if (!document?.fileUrl) throw new Error("document_processing_source_missing")
		const bytes = await readProviderDocumentObject({ fileUrl: document.fileUrl })
		const declaredMimeType =
			document.metadataJson && typeof document.metadataJson === "object"
				? String((document.metadataJson as Record<string, unknown>).mimeType ?? "") || null
				: null
		const local = inspectDocumentStructure(bytes, declaredMimeType)
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (!local.detectedMimeType) throw new Error("document_format_not_recognized")
		const gateway = await callDocumentGateway({
			documentId: document.id,
			documentType: document.type,
			fileUrl: document.fileUrl,
			sha256,
			detectedMimeType: local.detectedMimeType,
			allowExternalGateway,
		})
		const completedAt = new Date()
		if (!gateway) {
			await db
				.update(ProviderDocumentInspection)
				.set({
					processingState:
						local.structuralStatus === "invalid" || local.structuralStatus === "suspicious"
							? "blocked"
							: "awaiting_configuration",
					sha256,
					detectedMimeType: local.detectedMimeType,
					byteSize: bytes.byteLength,
					structuralStatus: local.structuralStatus,
					malwareStatus: "unavailable",
					ocrStatus: "unavailable",
					extractionStatus: "unavailable",
					tamperStatus: local.tamperStatus,
					tamperSignalsJson: local.signals,
					qualitySignalsJson: local.qualitySignals,
					errorCode: "document_analysis_gateway_not_configured",
					completedAt,
					updatedAt: completedAt,
				})
				.where(eq(ProviderDocumentInspection.documentId, document.id))
			await db
				.update(ProviderDocumentProcessingJob)
				.set({
					status: "blocked",
					attempts: job.attempts + 1,
					lastErrorCode: "document_analysis_gateway_not_configured",
					lockedAt: null,
					lockedBy: null,
					updatedAt: completedAt,
				})
				.where(eq(ProviderDocumentProcessingJob.id, job.id))
			return "blocked" as const
		}
		const blocked =
			local.structuralStatus !== "valid" ||
			gateway.malware.status === "infected" ||
			gateway.tamper.status === "suspected"
		await db
			.update(ProviderDocumentInspection)
			.set({
				processingState: blocked ? "blocked" : "completed",
				sha256,
				detectedMimeType: local.detectedMimeType,
				byteSize: bytes.byteLength,
				structuralStatus: local.structuralStatus,
				malwareStatus: gateway.malware.status,
				malwareEngine: gateway.malware.engine,
				malwareDefinitionVersion: gateway.malware.definitionVersion ?? null,
				ocrStatus: gateway.ocr.status,
				ocrProvider: gateway.ocr.provider,
				ocrLanguage: gateway.ocr.language ?? null,
				ocrConfidence: gateway.ocr.confidence ?? null,
				extractionStatus: gateway.extraction.status,
				extractedFieldsJson: gateway.extraction.fields,
				tamperStatus: local.structuralStatus === "suspicious" ? "suspected" : gateway.tamper.status,
				tamperSignalsJson: [...new Set([...local.signals, ...gateway.tamper.signals])],
				qualitySignalsJson: { ...local.qualitySignals, ...gateway.qualitySignals },
				errorCode: null,
				completedAt,
				updatedAt: completedAt,
			})
			.where(eq(ProviderDocumentInspection.documentId, document.id))
		await db
			.update(ProviderDocumentProcessingJob)
			.set({
				status: blocked ? "blocked" : "completed",
				attempts: job.attempts + 1,
				lastErrorCode: null,
				lockedAt: null,
				lockedBy: null,
				updatedAt: completedAt,
			})
			.where(eq(ProviderDocumentProcessingJob.id, job.id))
		return blocked ? ("blocked" as const) : ("completed" as const)
	} catch (error) {
		const attempts = job.attempts + 1
		const code = error instanceof Error ? error.message.slice(0, 120) : "document_processing_failed"
		const permanent = PERMANENT_SOURCE_ERRORS.has(code)
		const dead = attempts >= MAX_ATTEMPTS
		const retryAt = new Date(Date.now() + Math.min(2 ** attempts * 60_000, 60 * 60_000))
		await db
			.update(ProviderDocumentInspection)
			.set({
				processingState: permanent ? "blocked" : dead ? "failed" : "queued",
				...(permanent
					? {
							structuralStatus: code === "document_format_not_recognized" ? "invalid" : "error",
							malwareStatus: "unavailable",
							ocrStatus: "unavailable",
							extractionStatus: "unavailable",
							tamperStatus: "error",
						}
					: {}),
				errorCode: code,
				updatedAt: new Date(),
			})
			.where(eq(ProviderDocumentInspection.documentId, job.documentId))
		await db
			.update(ProviderDocumentProcessingJob)
			.set({
				status: permanent ? "blocked" : dead ? "dead_letter" : "retry",
				attempts,
				availableAt: retryAt,
				lastErrorCode: code,
				lockedAt: null,
				lockedBy: null,
				updatedAt: new Date(),
			})
			.where(eq(ProviderDocumentProcessingJob.id, job.id))
		return permanent ? ("blocked" as const) : dead ? ("failed" as const) : ("retry" as const)
	}
}

async function ensureDocumentProcessingBacklog() {
	await db.execute(sql`
		INSERT INTO "ProviderDocumentInspection" (
			"id", "documentId", "providerId", "processingState", "createdAt", "updatedAt"
		)
		SELECT document."id", document."id", document."providerId", 'queued', now(), now()
		FROM "ProviderDocument" document
		WHERE document."fileUrl" IS NOT NULL
			AND document."status" IN ('pending', 'verified')
		ON CONFLICT ("documentId") DO NOTHING
	`)
	await db.execute(sql`
		INSERT INTO "ProviderDocumentProcessingJob" (
			"id", "documentId", "status", "availableAt", "createdAt", "updatedAt"
		)
		SELECT 'document-processing:' || document."id", document."id", 'queued', now(), now(), now()
		FROM "ProviderDocument" document
		WHERE document."fileUrl" IS NOT NULL
			AND document."status" IN ('pending', 'verified')
		ON CONFLICT ("documentId") DO NOTHING
	`)
	await db.execute(sql`
		UPDATE "ProviderDocumentInspection" inspection
		SET
			"processingState" = 'blocked',
			"structuralStatus" = CASE
				WHEN job."lastErrorCode" = 'document_format_not_recognized' THEN 'invalid'
				ELSE 'error'
			END,
			"malwareStatus" = 'unavailable',
			"ocrStatus" = 'unavailable',
			"extractionStatus" = 'unavailable',
			"tamperStatus" = 'error',
			"updatedAt" = now()
		FROM "ProviderDocumentProcessingJob" job
		WHERE job."documentId" = inspection."documentId"
			AND job."status" = 'retry'
			AND job."lastErrorCode" IN (
				'document_processing_source_missing',
				'document_processing_source_unavailable',
				'document_processing_source_empty',
				'document_processing_source_too_large',
				'document_format_not_recognized'
			)
	`)
	await db.execute(sql`
		UPDATE "ProviderDocumentProcessingJob"
		SET "status" = 'blocked', "availableAt" = now(), "updatedAt" = now()
		WHERE "status" = 'retry'
			AND "lastErrorCode" IN (
				'document_processing_source_missing',
				'document_processing_source_unavailable',
				'document_processing_source_empty',
				'document_processing_source_too_large',
				'document_format_not_recognized'
			)
	`)
}

function documentGatewayConfigured() {
	return Boolean(
		String(process.env.DOCUMENT_ANALYSIS_GATEWAY_URL ?? "").trim() &&
		String(process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN ?? "").trim()
	)
}

export async function runProviderDocumentProcessingWorker(
	params: {
		limit?: number
		workerId?: string
		gatewayMode?: "configured" | "disabled"
	} = {}
) {
	const now = new Date()
	const allowExternalGateway = params.gatewayMode !== "disabled"
	await ensureDocumentProcessingBacklog()
	if (allowExternalGateway && documentGatewayConfigured()) {
		await db
			.update(ProviderDocumentProcessingJob)
			.set({
				status: "queued",
				availableAt: now,
				lastErrorCode: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(ProviderDocumentProcessingJob.status, "blocked"),
					eq(
						ProviderDocumentProcessingJob.lastErrorCode,
						"document_analysis_gateway_not_configured"
					)
				)
			)
	}
	await db
		.update(ProviderDocumentProcessingJob)
		.set({ status: "retry", lockedAt: null, lockedBy: null, availableAt: now, updatedAt: now })
		.where(
			and(
				eq(ProviderDocumentProcessingJob.status, "processing"),
				lt(ProviderDocumentProcessingJob.lockedAt, new Date(now.getTime() - LEASE_MS))
			)
		)
	const jobs = await db
		.select({
			id: ProviderDocumentProcessingJob.id,
			documentId: ProviderDocumentProcessingJob.documentId,
			attempts: ProviderDocumentProcessingJob.attempts,
		})
		.from(ProviderDocumentProcessingJob)
		.where(
			and(
				inArray(ProviderDocumentProcessingJob.status, ["queued", "retry"]),
				lte(ProviderDocumentProcessingJob.availableAt, now)
			)
		)
		.orderBy(ProviderDocumentProcessingJob.createdAt)
		.limit(Math.min(Math.max(params.limit ?? 10, 1), 25))
	const workerId = params.workerId ?? `document-worker:${randomUUID()}`
	const outcomes = { completed: 0, blocked: 0, retry: 0, failed: 0, skipped: 0 }
	for (const job of jobs) outcomes[await processJob(job, workerId, allowExternalGateway)] += 1
	return { claimed: jobs.length, ...outcomes }
}
