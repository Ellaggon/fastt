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
	allowLegacyLocalDocumentUrls,
	assertAllowedProviderDocumentUrl,
	isR2DocumentStorageConfigured,
	uploadProviderDocumentObject,
} from "@/lib/provider-document-storage"
import { providerRepository } from "@/container"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { resolveProviderRejectCategory } from "@/lib/provider-reject-categories"
import { routes } from "@/lib/routes"

/** Deep-link into Verificación fiscal NIT field (owner of taxpayer ID in trust flow). */
export const FISCAL_NIT_HREF = `${routes.providerSettingsVerificationFiscal()}#businessRegistrationNumber`

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

/**
 * When Fiscalidad already has a verified NIT/TIN, the tax_document upload is not required.
 */
export function isTaxDocumentSatisfiedByFiscal(params: {
	businessRegistrationNumber?: string | null
	fiscalStatus?: string | null
}): boolean {
	const nit = String(params.businessRegistrationNumber ?? "").trim()
	return (
		Boolean(nit) &&
		String(params.fiscalStatus ?? "")
			.trim()
			.toLowerCase() === "verified"
	)
}

export function evaluateRequiredKycDocumentsComplete(
	documents: Array<{ type: string; status: string }>,
	options?: {
		taxDocumentSatisfiedByFiscal?: boolean
	}
): {
	complete: boolean
	verifiedRequiredTypes: RequiredKycDocumentType[]
	missingRequiredTypes: RequiredKycDocumentType[]
} {
	const verifiedTypes = new Set(
		documents.filter((row) => row.status === "verified").map((row) => String(row.type))
	)
	if (options?.taxDocumentSatisfiedByFiscal) {
		verifiedTypes.add("tax_document")
	}
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
		description: "Pasaporte, cédula o licencia emitida por el gobierno.",
	},
	{
		value: "business_registration",
		label: "Registro mercantil",
		description: "Documento de constitución o registro de la empresa.",
	},
	{
		value: "tax_document",
		label: "Documento fiscal",
		description: "NIT/TIN vive en Fiscalidad. Aquí solo adjuntas constancia si te la pedimos.",
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

export type ProviderKycSlotState = "missing" | "pending" | "verified" | "rejected"

export type ProviderKycFiscalBridgeMode = "enter_nit" | "linked" | "needs_constancia"

export type ProviderKycFiscalBridge = {
	mode: ProviderKycFiscalBridgeMode
	fiscalHref: string
	nitMasked: string | null
	fiscalStatus: string
	fiscalStatusLabel: string
	bureauMatchStatus: string | null
	bureauMatchLabel: string | null
	bureauNarrative: string | null
	title: string
	body: string
	ctaLabel: string
	/** Hide blind upload; optional constancia only when allowOptionalUpload. */
	suppressBlindUpload: boolean
	allowOptionalUpload: boolean
}

export type ProviderKycSlot = {
	type: RequiredKycDocumentType
	label: string
	description: string
	consequence: string
	captureExample: string
	state: ProviderKycSlotState
	stateLabel: string
	documentId: string | null
	fileName: string | null
	reviewNotes: string | null
	rejectCategoryLabel: string | null
	uploadHref: string
	/** V1.1: tax_document ↔ Fiscalidad bridge (null for other slots). */
	fiscalBridge: ProviderKycFiscalBridge | null
}

export type BuildKycFiscalInput = {
	businessRegistrationNumber?: string | null
	status?: string | null
	statusLabel?: string | null
	tinBureau?: {
		matchStatus?: string | null
		matchLabel?: string | null
		hostNarrative?: string | null
		message?: string | null
	} | null
}

export function maskTaxpayerId(value: string | null | undefined): string | null {
	const raw = String(value ?? "").trim()
	if (!raw) return null
	const digits = raw.replace(/\s+/g, "")
	if (digits.length <= 4) return digits
	return `••••${digits.slice(-4)}`
}

/**
 * Bridge copy + flags for tax_document when Fiscalidad owns the NIT.
 */
export function buildTaxDocumentFiscalBridge(
	fiscal: BuildKycFiscalInput | null | undefined
): ProviderKycFiscalBridge | null {
	if (!fiscal) {
		return {
			mode: "enter_nit",
			fiscalHref: FISCAL_NIT_HREF,
			nitMasked: null,
			fiscalStatus: "not_configured",
			fiscalStatusLabel: "No configurado",
			bureauMatchStatus: null,
			bureauMatchLabel: null,
			bureauNarrative: null,
			title: "El NIT/TIN se captura en Fiscalidad",
			body: "No subas un PDF a ciegas aquí. Primero guarda el NIT en registro fiscal; si te pedimos constancia, podrás adjuntarla después.",
			ctaLabel: "Ir a registrar NIT",
			suppressBlindUpload: true,
			allowOptionalUpload: false,
		}
	}

	const nit = String(fiscal.businessRegistrationNumber ?? "").trim()
	const status = String(fiscal.status ?? "not_configured")
		.trim()
		.toLowerCase()
	const statusLabel = String(fiscal.statusLabel ?? status).trim() || status
	const bureau = fiscal.tinBureau ?? null
	const bureauMatchStatus = bureau?.matchStatus ? String(bureau.matchStatus) : null
	const bureauMatchLabel = bureau?.matchLabel ? String(bureau.matchLabel) : null
	const bureauNarrative = String(bureau?.hostNarrative || bureau?.message || "").trim() || null
	const nitMasked = maskTaxpayerId(nit)

	if (!nit) {
		return {
			mode: "enter_nit",
			fiscalHref: FISCAL_NIT_HREF,
			nitMasked: null,
			fiscalStatus: status,
			fiscalStatusLabel: statusLabel,
			bureauMatchStatus,
			bureauMatchLabel,
			bureauNarrative,
			title: "Falta el NIT/TIN en Fiscalidad",
			body: "Fiscalidad es la dueña del número. Completa el registro allí; este slot no pide el mismo dato otra vez.",
			ctaLabel: "Completar NIT en fiscal",
			suppressBlindUpload: true,
			allowOptionalUpload: false,
		}
	}

	const needsConstancia =
		status === "requires_attention" ||
		bureauMatchStatus === "mismatch" ||
		bureauMatchStatus === "unavailable"

	if (needsConstancia) {
		return {
			mode: "needs_constancia",
			fiscalHref: FISCAL_NIT_HREF,
			nitMasked,
			fiscalStatus: status,
			fiscalStatusLabel: statusLabel,
			bureauMatchStatus,
			bureauMatchLabel,
			bureauNarrative,
			title: "NIT guardado — puede hacer falta constancia",
			body: "Revisa el estado en Fiscalidad. Adjunta constancia solo si te la pedimos o el bureau no pudo confirmar el match.",
			ctaLabel: "Ver registro fiscal",
			suppressBlindUpload: false,
			allowOptionalUpload: true,
		}
	}

	return {
		mode: "linked",
		fiscalHref: FISCAL_NIT_HREF,
		nitMasked,
		fiscalStatus: status,
		fiscalStatusLabel: statusLabel,
		bureauMatchStatus,
		bureauMatchLabel,
		bureauNarrative,
		title: "NIT/TIN ya está en Fiscalidad",
		body: "No hace falta subir el mismo número otra vez. Sigue el estado bureau y de revisión en registro fiscal.",
		ctaLabel: "Ver estado en fiscal",
		suppressBlindUpload: true,
		allowOptionalUpload: false,
	}
}

const kycSlotStateLabels: Record<ProviderKycSlotState, string> = {
	missing: "Falta",
	pending: "Enviado",
	verified: "Verificado",
	rejected: "Requiere cambios",
}

const kycSlotConsequences: Record<RequiredKycDocumentType, string> = {
	government_id:
		"Sin este documento no se completa el cumplimiento mínimo: la cuenta no puede publicarse con confianza.",
	business_registration:
		"Sin el registro mercantil no se puede completar la verificación comercial del proveedor.",
	tax_document:
		"Sin NIT/TIN verificado en Fiscalidad (o constancia si te la pedimos) no puedes liquidar cobros.",
}

/** Shared photo/file tips shown in the capture coach (legacy + coach base). */
export const kycCaptureSharedTips = [
	"Luz pareja; evita sombra o reflejo en el papel.",
	"Que se vean los cuatro bordes; sin recortes.",
	"Texto legible (nombres, fechas, NIT/número).",
	"PDF o foto nítida; máximo 12 MB.",
] as const

export type KycCaptureFrameKind = "id_card" | "registry_page" | "tax_certificate"

export type KycCaptureTip = {
	id: string
	/** Short chip label */
	label: string
	/** One-line coaching detail */
	detail: string
}

export type KycCaptureGuide = {
	frameKind: KycCaptureFrameKind
	frameLabel: string
	/** Visual tips unique to this document type */
	tips: KycCaptureTip[]
	example: string
	/** Mobile-first coaching line */
	mobileHint: string
	acceptHint: string
	/** Prefer rear-camera shortcut on mobile (ID photos); PDF-first types stay false. */
	preferCameraCapture: boolean
}

/**
 * V2 capture polish — per-type visual tips + examples (no selfie vendor).
 */
export const kycCaptureGuideByType: Record<RequiredKycDocumentType, KycCaptureGuide> = {
	government_id: {
		frameKind: "id_card",
		frameLabel: "Cédula / pasaporte",
		tips: [
			{
				id: "edges",
				label: "Bordes",
				detail: "Los cuatro bordes del documento deben verse enteros.",
			},
			{
				id: "glare",
				label: "Sin brillo",
				detail: "Inclina un poco para evitar reflejo en el plástico.",
			},
			{
				id: "text",
				label: "Texto nítido",
				detail: "Nombre, número y fecha deben leerse sin zoom.",
			},
			{
				id: "sides",
				label: "Ambos lados",
				detail: "Si el reverso tiene datos, inclúyelo en el mismo PDF o segunda foto.",
			},
		],
		example:
			"Ejemplo: foto frontal de la cédula con los cuatro bordes visibles (ambos lados si aplica).",
		mobileHint:
			"En el móvil: usa la cámara trasera o elige una foto de la galería. Evita capturas desde otra pantalla.",
		acceptHint: "PDF o foto · máx. 12 MB",
		preferCameraCapture: true,
	},
	business_registration: {
		frameKind: "registry_page",
		frameLabel: "Registro mercantil",
		tips: [
			{
				id: "page",
				label: "Página clave",
				detail: "La hoja donde aparece razón social y número de registro.",
			},
			{
				id: "full",
				label: "Página completa",
				detail: "No recortes sellos ni márgenes oficiales.",
			},
			{
				id: "contrast",
				label: "Contraste",
				detail: "Fondo claro; evita sombra de la mano o el flash duro.",
			},
			{
				id: "multi",
				label: "Varias páginas",
				detail: "Si son varias hojas, un solo PDF ordenado es mejor que muchas fotos.",
			},
		],
		example: "Ejemplo: página del registro donde se lea la razón social y el número de registro.",
		mobileHint:
			"En el móvil: si tienes el PDF del registro, elígelo desde Archivos; si es papel, fotografía la página completa.",
		acceptHint: "PDF preferido · foto aceptada · máx. 12 MB",
		preferCameraCapture: false,
	},
	tax_document: {
		frameKind: "tax_certificate",
		frameLabel: "Constancia fiscal",
		tips: [
			{
				id: "nit",
				label: "NIT legible",
				detail: "El NIT/TIN debe verse completo, sin tapar con el dedo.",
			},
			{
				id: "name",
				label: "Razón social",
				detail: "Debe coincidir con la de Perfil / Fiscalidad.",
			},
			{
				id: "date",
				label: "Vigencia",
				detail: "Usa la versión vigente; evita constancias vencidas.",
			},
			{
				id: "only-if",
				label: "Solo si te la piden",
				detail: "El NIT vive en Fiscalidad; adjunta constancia solo cuando haga falta.",
			},
		],
		example: "Ejemplo: certificado o constancia con el NIT/TIN completo y legible.",
		mobileHint: "En el móvil: prefiere el PDF oficial. Si fotografías, encuadra el sello y el NIT.",
		acceptHint: "PDF preferido · foto aceptada · máx. 12 MB",
		preferCameraCapture: false,
	},
}

export const kycCaptureExampleByType: Record<RequiredKycDocumentType, string> = {
	government_id: kycCaptureGuideByType.government_id.example,
	business_registration: kycCaptureGuideByType.business_registration.example,
	tax_document: kycCaptureGuideByType.tax_document.example,
}

export function getKycCaptureGuide(type: string): KycCaptureGuide {
	const key = String(type ?? "").trim() as RequiredKycDocumentType
	return kycCaptureGuideByType[key] ?? kycCaptureGuideByType.government_id
}

/**
 * Parse KYC capture timing beacon payload (`ctaTarget`).
 * Example: `doc=government_id;ms=4200;file_to_submit_ms=800`
 */
export function parseKycCaptureTimingTarget(ctaTarget: unknown): {
	documentType: string | null
	durationMs: number | null
	fileToSubmitMs: number | null
} {
	const raw = String(ctaTarget ?? "").trim()
	if (!raw) return { documentType: null, durationMs: null, fileToSubmitMs: null }
	const parts = Object.fromEntries(
		raw
			.split(";")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const idx = part.indexOf("=")
				if (idx < 0) return [part, ""] as const
				return [part.slice(0, idx), part.slice(idx + 1)] as const
			})
	)
	const durationMs = Number(parts.ms)
	const fileToSubmitMs = Number(parts.file_to_submit_ms)
	return {
		documentType: parts.doc ? String(parts.doc).trim() || null : null,
		durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null,
		fileToSubmitMs:
			Number.isFinite(fileToSubmitMs) && fileToSubmitMs >= 0 ? Math.round(fileToSubmitMs) : null,
	}
}

/**
 * Exactly one required slot owns the upload form (hard one-doc).
 * Priority: ?type= (if uploadable) → first rejected → first missing → none.
 * Bridged tax_document with suppressBlindUpload is not uploadable.
 */
export function resolveKycUploadFocusType(params: {
	slots: Array<{
		type: string
		state: string
		fiscalBridge?: ProviderKycFiscalBridge | null
	}>
	focusType?: string | null
}): string | null {
	const requested = String(params.focusType ?? "").trim()
	const uploadable = (slot: {
		type: string
		state: string
		fiscalBridge?: ProviderKycFiscalBridge | null
	}) => {
		if (slot.state === "rejected") return true
		if (slot.state !== "missing") return false
		const bridge = slot.fiscalBridge
		if (!bridge) return true
		if (bridge.allowOptionalUpload) return true
		if (bridge.suppressBlindUpload) return false
		return true
	}
	if (requested) {
		const match = params.slots.find((slot) => slot.type === requested)
		if (match && uploadable(match)) return match.type
		// Explicit ?type= that is bridged / not uploadable → no blind form.
		if (match) return null
	}
	return (
		params.slots.find((slot) => slot.state === "rejected" && uploadable(slot))?.type ??
		params.slots.find((slot) => slot.state === "missing" && uploadable(slot))?.type ??
		null
	)
}

function pickLatestDocumentForType(
	documents: ProviderDocumentRecord[],
	type: RequiredKycDocumentType
): ProviderDocumentRecord | null {
	const candidates = documents
		.filter((doc) => doc.type === type && doc.status !== "superseded")
		.sort((a, b) => {
			const rank = (status: string) =>
				status === "verified" ? 3 : status === "pending" ? 2 : status === "rejected" ? 1 : 0
			const byStatus = rank(b.status) - rank(a.status)
			if (byStatus !== 0) return byStatus
			const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
			const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
			return bTime - aTime
		})
	return candidates[0] ?? null
}

/**
 * Provider-facing KYC minimum set as three slots (missing / pending / verified / rejected).
 * tax_document bridges to Fiscalidad when NIT exists (V1.1).
 */
export function buildRequiredKycSlots(params: {
	documents: ProviderDocumentRecord[]
	uploadBasePath?: string
	taxFiscal?: BuildKycFiscalInput | null
}): ProviderKycSlot[] {
	const base = String(params.uploadBasePath ?? "/provider/settings/verification").trim()
	const taxBridge = buildTaxDocumentFiscalBridge(params.taxFiscal ?? null)

	return requiredKycDocumentTypes.map((type) => {
		const meta = providerDocumentTypes.find((item) => item.value === type)
		const document = pickLatestDocumentForType(params.documents, type)
		const fiscalBridge = type === "tax_document" ? taxBridge : null

		let state: ProviderKycSlotState =
			document?.status === "verified"
				? "verified"
				: document?.status === "pending"
					? "pending"
					: document?.status === "rejected"
						? "rejected"
						: "missing"

		// Bridge-driven state when there is no uploaded tax_document yet.
		if (type === "tax_document" && !document && fiscalBridge) {
			if (fiscalBridge.mode === "linked") {
				const fiscalStatus = fiscalBridge.fiscalStatus
				if (fiscalStatus === "verified") state = "verified"
				else if (fiscalStatus === "pending") state = "pending"
				else if (fiscalStatus === "requires_attention") state = "rejected"
				else state = "pending"
			} else if (fiscalBridge.mode === "needs_constancia") {
				state = "rejected"
			}
			// enter_nit stays "missing" — CTA to Fiscal, not blind upload
		}

		const uploadHref = `${base}?type=${encodeURIComponent(type)}#kyc-slot-${type}`
		const rejectCategoryLabel =
			state === "rejected" && document
				? resolveProviderRejectCategory(document?.reviewNotes, "documents").label
				: null
		return {
			type,
			label: meta?.label ?? type,
			description: meta?.description ?? "",
			consequence: kycSlotConsequences[type],
			captureExample: kycCaptureExampleByType[type],
			state,
			stateLabel: kycSlotStateLabels[state],
			documentId: document?.id ?? null,
			fileName: document?.fileName ?? null,
			reviewNotes: state === "rejected" ? String(document?.reviewNotes ?? "").trim() || null : null,
			rejectCategoryLabel,
			uploadHref,
			fiscalBridge,
		}
	})
}

const statusMeta: Record<
	ProviderDocumentStatus,
	{ label: string; tone: ProviderDocumentRecord["tone"] }
> = {
	pending: { label: "Enviado", tone: "warning" },
	verified: { label: "Verificado", tone: "success" },
	rejected: { label: "Requiere cambios", tone: "error" },
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

const extensionMimeTypes: Record<string, string> = {
	pdf: "application/pdf",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	heic: "image/heic",
	heif: "image/heif",
}

/** Browsers (esp. macOS) often send empty File.type for PDFs — infer from name. */
export function inferDocumentMimeType(params: {
	mimeType?: string | null
	fileName?: string | null
}): string | null {
	const raw = String(params.mimeType ?? "")
		.trim()
		.toLowerCase()
	if (raw && allowedMimeTypes.has(raw)) return raw
	// Some browsers send application/x-pdf / octet-stream for PDFs
	if (raw === "application/x-pdf" || raw === "application/acrobat") return "application/pdf"
	const name = String(params.fileName ?? "")
		.trim()
		.toLowerCase()
	const ext = name.includes(".") ? name.split(".").pop() || "" : ""
	const inferred = extensionMimeTypes[ext] ?? null
	if (inferred) return inferred
	if (raw === "application/octet-stream" && ext === "pdf") return "application/pdf"
	return raw && allowedMimeTypes.has(raw) ? raw : null
}

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
	// Align with session surface: sole members / no-owner staff get healed to owner.
	await providerRepository.healProviderUserRoleIfNeeded({ providerId, userId }).catch(() => null)

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
	const mimeType = inferDocumentMimeType({
		mimeType: String(params.mimeType ?? "").trim() || null,
		fileName,
	})
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
		if (!fileName) {
			const error = new Error("document_file_meta_required")
			;(error as Error & { status?: number }).status = 400
			throw error
		}
		const resolvedMime = mimeType || "application/octet-stream"
		if (isR2DocumentStorageConfigured()) {
			try {
				const uploaded = await uploadProviderDocumentObject({
					providerId: params.providerId,
					documentId: id,
					fileName,
					mimeType: resolvedMime === "application/octet-stream" ? "application/pdf" : resolvedMime,
					body: params.fileBytes!,
				})
				fileUrl = uploaded.fileUrl
			} catch (uploadErr) {
				console.error("provider.document.r2_upload_failed", {
					providerId: params.providerId,
					documentId: id,
					fileName,
					error: String((uploadErr as Error)?.message || uploadErr),
				})
				// Local/dev: keep the submission usable if R2 is misconfigured.
				if (allowLegacyLocalDocumentUrls() || process.env.NODE_ENV !== "production") {
					fileUrl = `local://provider-documents/${params.providerId}/${id}/${fileName}`
				} else {
					const error = new Error("document_storage_upload_failed")
					;(error as Error & { status?: number }).status = 502
					throw error
				}
			}
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

	// Avoid a second full list query (can timeout on remote Postgres under load).
	return mapRow({
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
	const fileName = file.name || "document"
	const mimeType = inferDocumentMimeType({
		mimeType: String(file.type || "").trim() || null,
		fileName,
	})
	if (String(file.type || "").trim() && !mimeType) {
		const error = new Error("unsupported_mime_type")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	return {
		fileName,
		mimeType,
		sizeBytes: file.size,
	}
}
