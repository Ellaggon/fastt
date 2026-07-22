import {
	first,
	and,
	db,
	desc,
	eq,
	ProviderDocument,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"

import { inferSettingsRiskLevel, writeProviderAuditLog } from "@/lib/provider-audit"
import { completeComplianceAssignment } from "@/lib/provider-compliance-ops"
import {
	assertAllowedProviderDocumentUrl,
	isR2DocumentStorageConfigured,
	uploadProviderDocumentObject,
} from "@/lib/provider-document-storage"
import { resolveProviderPermissions } from "@/lib/provider-permissions"

/**
 * Provider compliance documents.
 *
 * Aligned with Airbnb KYC / business verification and Expedia lodging onboarding:
 * - government ID for identity
 * - business registration for commercial hosts
 * - tax documents for payout / withholding readiness
 * - ownership / operating license / address proof when requested for property or payouts
 *
 * Source of truth: ProviderDocument
 * Derived consumer: provider-governance documents readiness
 */
export type ProviderDocumentType =
	| "government_id"
	| "business_registration"
	| "tax_document"
	| "ownership_proof"
	| "operating_license"
	| "address_proof"

export type ProviderDocumentStatus = "pending" | "verified" | "rejected" | "superseded"

export type ProviderDocumentRecord = {
	id: string
	providerId: string
	type: ProviderDocumentType
	typeLabel: string
	status: ProviderDocumentStatus
	statusLabel: string
	tone: "neutral" | "success" | "warning" | "error" | "info"
	fileUrl: string | null
	fileName: string | null
	mimeType: string | null
	sizeBytes: number | null
	submissionNotes: string | null
	reviewNotes: string | null
	reviewedAt: Date | null
	reviewedBy: string | null
	createdAt: Date | null
	updatedAt: Date | null
}

export const requiredKycDocumentTypes = [
	"government_id",
	"business_registration",
	"tax_document",
] as const satisfies ReadonlyArray<ProviderDocumentType>

export type RequiredKycDocumentType = (typeof requiredKycDocumentTypes)[number]

export function evaluateRequiredKycDocumentsComplete(
	documents: Array<{ type: string; status: string }>
): {
	complete: boolean
	verifiedRequiredTypes: RequiredKycDocumentType[]
	missingRequiredTypes: RequiredKycDocumentType[]
} {
	const verifiedTypes = new Set(
		documents.filter((row) => row.status === "verified").map((row) => String(row.type))
	)
	const verifiedRequiredTypes = requiredKycDocumentTypes.filter((type) => verifiedTypes.has(type))
	const missingRequiredTypes = requiredKycDocumentTypes.filter((type) => !verifiedTypes.has(type))
	return {
		complete: missingRequiredTypes.length === 0,
		verifiedRequiredTypes,
		missingRequiredTypes,
	}
}

export const providerDocumentTypes: Array<{
	value: ProviderDocumentType
	label: string
	description: string
}> = [
	{
		value: "government_id",
		label: "Documento de identidad",
		description: "Pasaporte, cédula o licencia emitida por el gobierno (KYC).",
	},
	{
		value: "business_registration",
		label: "Registro mercantil",
		description: "Documento de constitución o registro de la empresa.",
	},
	{
		value: "tax_document",
		label: "Documento fiscal",
		description: "NIT/TIN, W-9/W-8 u otro respaldo fiscal para payouts.",
	},
	{
		value: "ownership_proof",
		label: "Prueba de propiedad",
		description: "Escritura, contrato o autorización de operación del inmueble.",
	},
	{
		value: "operating_license",
		label: "Licencia de operación",
		description: "Permiso municipal, turístico u otra licencia operativa.",
	},
	{
		value: "address_proof",
		label: "Comprobante de domicilio",
		description: "Factura de servicios u otro respaldo de dirección (payouts).",
	},
]

const statusMeta: Record<
	ProviderDocumentStatus,
	{ label: string; tone: ProviderDocumentRecord["tone"] }
> = {
	pending: { label: "Pendiente de revisión", tone: "warning" },
	verified: { label: "Verificado", tone: "success" },
	rejected: { label: "Rechazado", tone: "error" },
	superseded: { label: "Reemplazado", tone: "neutral" },
}

const allowedMimeTypes = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
])

const maxFileBytes = 12 * 1024 * 1024

function asDocumentType(value: unknown): ProviderDocumentType | null {
	const raw = String(value ?? "").trim()
	return providerDocumentTypes.some((item) => item.value === raw)
		? (raw as ProviderDocumentType)
		: null
}

function asDocumentStatus(value: unknown): ProviderDocumentStatus {
	const raw = String(value ?? "pending").trim()
	if (raw === "verified" || raw === "rejected" || raw === "superseded" || raw === "pending") {
		return raw
	}
	return "pending"
}

function typeLabel(type: ProviderDocumentType) {
	return providerDocumentTypes.find((item) => item.value === type)?.label ?? type
}

function readMetadata(value: unknown): {
	fileName: string | null
	mimeType: string | null
	sizeBytes: number | null
	submissionNotes: string | null
} {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { fileName: null, mimeType: null, sizeBytes: null, submissionNotes: null }
	}
	const raw = value as Record<string, unknown>
	return {
		fileName: typeof raw.fileName === "string" ? raw.fileName : null,
		mimeType: typeof raw.mimeType === "string" ? raw.mimeType : null,
		sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : null,
		submissionNotes: typeof raw.submissionNotes === "string" ? raw.submissionNotes : null,
	}
}

function mapRow(row: {
	id: string
	providerId: string
	type: string
	status: string
	fileUrl: string | null
	metadataJson: unknown
	reviewNotes: string | null
	reviewedAt: Date | null
	reviewedBy: string | null
	createdAt: Date | null
	updatedAt: Date | null
}): ProviderDocumentRecord {
	const type = asDocumentType(row.type) ?? "business_registration"
	const status = asDocumentStatus(row.status)
	const meta = statusMeta[status]
	const metadata = readMetadata(row.metadataJson)
	return {
		id: row.id,
		providerId: row.providerId,
		type,
		typeLabel: typeLabel(type),
		status,
		statusLabel: meta.label,
		tone: meta.tone,
		fileUrl: row.fileUrl ?? null,
		fileName: metadata.fileName,
		mimeType: metadata.mimeType,
		sizeBytes: metadata.sizeBytes,
		submissionNotes: metadata.submissionNotes,
		reviewNotes: row.reviewNotes ?? null,
		reviewedAt: row.reviewedAt ?? null,
		reviewedBy: row.reviewedBy ?? null,
		createdAt: row.createdAt ?? null,
		updatedAt: row.updatedAt ?? null,
	}
}

async function getProviderRole(providerId: string, userId: string) {
	return (
		(await db
			.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
			.from(ProviderUser)
			.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
			.then(first)) ?? null
	)
}

export async function assertCanManageDocuments(providerId: string, userId: string) {
	const link = await getProviderRole(providerId, userId)
	const permissions = resolveProviderPermissions({
		role: link?.role,
		permissionsJson: link?.permissionsJson,
	})
	if (!permissions.canManageDocuments) {
		const error = new Error("forbidden")
		;(error as Error & { status?: number }).status = 403
		throw error
	}
	return { link, permissions }
}

export async function listProviderDocuments(providerId: string): Promise<ProviderDocumentRecord[]> {
	const rows = await db
		.select({
			id: ProviderDocument.id,
			providerId: ProviderDocument.providerId,
			type: ProviderDocument.type,
			status: ProviderDocument.status,
			fileUrl: ProviderDocument.fileUrl,
			metadataJson: ProviderDocument.metadataJson,
			reviewNotes: ProviderDocument.reviewNotes,
			reviewedAt: ProviderDocument.reviewedAt,
			reviewedBy: ProviderDocument.reviewedBy,
			createdAt: ProviderDocument.createdAt,
			updatedAt: ProviderDocument.updatedAt,
		})
		.from(ProviderDocument)
		.where(eq(ProviderDocument.providerId, providerId))
		.orderBy(desc(ProviderDocument.createdAt), desc(ProviderDocument.id))

		.catch(() => [])

	return rows.map(mapRow)
}

/** Cross-provider pending queue for internal admin review console. */
export async function listPendingProviderDocumentsForAdmin(): Promise<ProviderDocumentRecord[]> {
	const rows = await db
		.select({
			id: ProviderDocument.id,
			providerId: ProviderDocument.providerId,
			type: ProviderDocument.type,
			status: ProviderDocument.status,
			fileUrl: ProviderDocument.fileUrl,
			metadataJson: ProviderDocument.metadataJson,
			reviewNotes: ProviderDocument.reviewNotes,
			reviewedAt: ProviderDocument.reviewedAt,
			reviewedBy: ProviderDocument.reviewedBy,
			createdAt: ProviderDocument.createdAt,
			updatedAt: ProviderDocument.updatedAt,
		})
		.from(ProviderDocument)
		.where(eq(ProviderDocument.status, "pending"))
		.orderBy(desc(ProviderDocument.createdAt), desc(ProviderDocument.id))

		.catch(() => [])

	return rows.map(mapRow)
}

export async function submitProviderDocument(params: {
	providerId: string
	actorUserId: string
	type: unknown
	fileUrl?: unknown
	fileName?: unknown
	mimeType?: unknown
	sizeBytes?: unknown
	submissionNotes?: unknown
	/** When set with R2 configured, uploads bytes and stores an r2: ref. */
	fileBytes?: Uint8Array | Buffer | null
}) {
	await assertCanManageDocuments(params.providerId, params.actorUserId)

	const type = asDocumentType(params.type)
	if (!type) {
		const error = new Error("invalid_document_type")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const fileUrlRaw = String(params.fileUrl ?? "").trim()
	const fileName = String(params.fileName ?? "").trim() || null
	const mimeType = String(params.mimeType ?? "").trim() || null
	const sizeBytes =
		typeof params.sizeBytes === "number" && Number.isFinite(params.sizeBytes)
			? params.sizeBytes
			: Number(params.sizeBytes)
	const normalizedSize = Number.isFinite(sizeBytes) && sizeBytes > 0 ? Math.floor(sizeBytes) : null
	const submissionNotes = String(params.submissionNotes ?? "").trim() || null
	const hasBytes = Boolean(params.fileBytes && params.fileBytes.byteLength > 0)

	if (!fileUrlRaw && !fileName && !hasBytes) {
		const error = new Error("document_file_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	if (mimeType && !allowedMimeTypes.has(mimeType)) {
		const error = new Error("unsupported_mime_type")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	if (normalizedSize != null && normalizedSize > maxFileBytes) {
		const error = new Error("file_too_large")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const now = new Date()
	const id = crypto.randomUUID()

	let fileUrl = fileUrlRaw
	if (hasBytes) {
		if (!mimeType || !fileName) {
			const error = new Error("document_file_meta_required")
			;(error as Error & { status?: number }).status = 400
			throw error
		}
		if (isR2DocumentStorageConfigured()) {
			const uploaded = await uploadProviderDocumentObject({
				providerId: params.providerId,
				documentId: id,
				fileName,
				mimeType,
				body: params.fileBytes!,
			})
			fileUrl = uploaded.fileUrl
		} else {
			fileUrl = `local://provider-documents/${params.providerId}/${id}/${fileName}`
		}
	} else if (!fileUrl) {
		fileUrl = `local://provider-documents/${params.providerId}/${id}/${fileName}`
	}

	assertAllowedProviderDocumentUrl(fileUrl)

	const activeSameType = await db
		.select({ id: ProviderDocument.id, status: ProviderDocument.status })
		.from(ProviderDocument)
		.where(
			and(
				eq(ProviderDocument.providerId, params.providerId),
				eq(ProviderDocument.type, type),
				eq(ProviderDocument.status, "pending")
			)
		)

		.catch(() => [])

	for (const row of activeSameType) {
		await db
			.update(ProviderDocument)
			.set({ status: "superseded", updatedAt: now })
			.where(eq(ProviderDocument.id, row.id))
	}

	const metadataJson = {
		fileName,
		mimeType,
		sizeBytes: normalizedSize,
		submissionNotes,
		source: "provider.settings.documents",
		storage: fileUrl.startsWith("r2:") ? "r2" : fileUrl.startsWith("local://") ? "local" : "url",
	}

	await db.insert(ProviderDocument).values({
		id,
		providerId: params.providerId,
		type,
		status: "pending",
		fileUrl,
		metadataJson,
		reviewNotes: null,
		reviewedAt: null,
		reviewedBy: null,
		createdAt: now,
		updatedAt: now,
	})

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.document.submit",
		entityType: "ProviderDocument",
		entityId: id,
		beforeJson: activeSameType.length
			? { supersededIds: activeSameType.map((row) => row.id) }
			: null,
		afterJson: {
			type,
			status: "pending",
			fileUrl,
			fileName,
			mimeType,
			sizeBytes: normalizedSize,
		},
		riskLevel: inferSettingsRiskLevel({ domain: "documents" }),
	})

	const created = await listProviderDocuments(params.providerId)
	return created.find((row) => row.id === id)!
}

/**
 * Internal-admin document review. Caller must already have passed
 * requireInternalAdmin — this does not use provider-role permissions
 * (providers may submit, but never self-verify KYC docs).
 */
export async function reviewProviderDocument(params: {
	providerId: string
	actorUserId: string
	documentId: string
	status: unknown
	reviewNotes?: unknown
}) {
	const nextStatus = asDocumentStatus(params.status)
	if (nextStatus !== "verified" && nextStatus !== "rejected") {
		const error = new Error("invalid_review_status")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const reviewNotes = String(params.reviewNotes ?? "").trim()
	if (nextStatus === "rejected" && !reviewNotes) {
		const error = new Error("review_notes_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}

	const existing = await db
		.select({
			id: ProviderDocument.id,
			providerId: ProviderDocument.providerId,
			type: ProviderDocument.type,
			status: ProviderDocument.status,
			fileUrl: ProviderDocument.fileUrl,
			metadataJson: ProviderDocument.metadataJson,
			reviewNotes: ProviderDocument.reviewNotes,
			reviewedAt: ProviderDocument.reviewedAt,
			reviewedBy: ProviderDocument.reviewedBy,
			createdAt: ProviderDocument.createdAt,
			updatedAt: ProviderDocument.updatedAt,
		})
		.from(ProviderDocument)
		.where(
			and(
				eq(ProviderDocument.id, params.documentId),
				eq(ProviderDocument.providerId, params.providerId)
			)
		)
		.then(first)

	if (!existing?.id) {
		const error = new Error("not_found")
		;(error as Error & { status?: number }).status = 404
		throw error
	}

	if (existing.status !== "pending") {
		const error = new Error("not_pending")
		;(error as Error & { status?: number }).status = 409
		throw error
	}

	const now = new Date()
	const before = mapRow(existing)

	await db
		.update(ProviderDocument)
		.set({
			status: nextStatus,
			reviewNotes: reviewNotes || null,
			reviewedAt: now,
			reviewedBy: params.actorUserId,
			updatedAt: now,
		})
		.where(eq(ProviderDocument.id, existing.id))

	await writeProviderAuditLog({
		providerId: params.providerId,
		actorUserId: params.actorUserId,
		action: "provider.document.review",
		entityType: "ProviderDocument",
		entityId: existing.id,
		beforeJson: {
			status: before.status,
			reviewNotes: before.reviewNotes,
		},
		afterJson: {
			status: nextStatus,
			reviewNotes: reviewNotes || null,
		},
		riskLevel: inferSettingsRiskLevel({ domain: "documents" }),
	})

	await completeComplianceAssignment({
		providerId: params.providerId,
		domain: "documents",
		entityId: existing.id,
	})

	const updated = await listProviderDocuments(params.providerId)
	return updated.find((row) => row.id === existing.id)!
}

export function validateDocumentFile(file: File | null) {
	if (!file) return null
	if (file.size <= 0) {
		const error = new Error("empty_file")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (file.size > maxFileBytes) {
		const error = new Error("file_too_large")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	const mimeType = String(file.type || "").trim()
	if (mimeType && !allowedMimeTypes.has(mimeType)) {
		const error = new Error("unsupported_mime_type")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	return {
		fileName: file.name || "document",
		mimeType: mimeType || null,
		sizeBytes: file.size,
	}
}
