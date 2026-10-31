import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { r2, getDocumentR2Client } from "@/container/shared.container"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"

const OBJECT_PREFIX = "provider-documents"

export type ProviderDocumentPreviewState = "ready" | "missing" | "unavailable"

export type ProviderDocumentPreviewAvailability = {
	state: ProviderDocumentPreviewState
	message: string
}

export function isR2DocumentStorageConfigured(): boolean {
	return Boolean(documentStorageConfig())
}

function storageFor(fileUrl: string) {
	if (fileUrl.startsWith("r2-documents:")) {
		const config = documentStorageConfig()
		return config ? { client: getDocumentR2Client(), bucket: config.bucket } : null
	}
	// Historical references retain their original bucket until an explicit migration.
	return process.env.R2_BUCKET_NAME &&
		process.env.R2_ACCOUNT_ID &&
		process.env.R2_ACCESS_KEY_ID &&
		process.env.R2_SECRET_ACCESS_KEY
		? { client: r2, bucket: process.env.R2_BUCKET_NAME }
		: null
}

export function allowLegacyLocalDocumentUrls(): boolean {
	// A test runner alone must never relax a development/production environment.
	return process.env.FASTT_DATA_ENV === "test"
}

export function buildProviderDocumentObjectKey(params: {
	providerId: string
	documentId: string
	fileName: string
}): string {
	if (![params.providerId, params.documentId].every((id) => /^[a-zA-Z0-9_-]+$/.test(id)))
		throw new Error("invalid_document_object_identity")
	return `${OBJECT_PREFIX}/${params.providerId}/${params.documentId}/original`
}

export function toProviderDocumentFileRef(objectKey: string): string {
	if (!/^provider-documents\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/original$/.test(objectKey))
		throw new Error("invalid_document_object_key")
	return `r2-documents:${objectKey}`
}

export function parseProviderDocumentObjectKey(fileUrl: string | null | undefined): string | null {
	const raw = String(fileUrl ?? "").trim()
	if (!raw) return null
	if (raw.startsWith("r2-documents:")) {
		const key = raw.slice("r2-documents:".length)
		return /^provider-documents\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(?:original|[a-zA-Z0-9_.-]+)$/.test(
			key
		) && !key.includes("..")
			? key
			: null
	}
	if (raw.startsWith("r2:")) return raw.slice(3)
	const publicBase = String(process.env.R2_PUBLIC_BASE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	if (publicBase && raw.startsWith(`${publicBase}/`)) {
		return raw.slice(publicBase.length + 1)
	}
	return null
}

export function assertAllowedProviderDocumentUrl(fileUrl: string): void {
	const raw = String(fileUrl ?? "").trim()
	if (!raw) {
		const error = new Error("document_file_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (raw.startsWith("local://")) {
		if (allowLegacyLocalDocumentUrls()) return
		const error = new Error("local_document_url_not_allowed")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	if (raw.startsWith("r2-documents:") && !parseProviderDocumentObjectKey(raw))
		throw Object.assign(new Error("invalid_document_storage_url"), { status: 400 })
	if (raw.startsWith("r2:") || raw.startsWith("r2-documents:")) return
	const publicBase = String(process.env.R2_PUBLIC_BASE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	if (publicBase && raw.startsWith(`${publicBase}/`)) return
	// Integration fixtures use non-routable example.com URLs; this exception
	// never applies to runtime environments.
	if (process.env.VITEST && /^https:\/\/cdn\.example\.com\//i.test(raw)) return
	if (/^https:\/\//i.test(raw) && !isR2DocumentStorageConfigured()) return
	const error = new Error("invalid_document_storage_url")
	;(error as Error & { status?: number }).status = 400
	throw error
}

/**
 * Answers whether an internal reviewer can open an artifact now, without
 * returning a URL or file content. R2 references are checked with HEAD so a
 * stale database reference is never presented as reviewable evidence.
 */
export async function inspectProviderDocumentPreview(params: {
	fileUrl: string | null | undefined
}): Promise<ProviderDocumentPreviewAvailability> {
	const raw = String(params.fileUrl ?? "").trim()
	if (!raw)
		return {
			state: "missing",
			message: "El envío conserva metadatos, pero no contiene un archivo adjunto.",
		}
	if (raw.startsWith("local://"))
		return {
			state: "unavailable",
			message: "La referencia es local y no puede abrirse desde el Centro de Mando desplegado.",
		}
	const objectKey = parseProviderDocumentObjectKey(raw)
	if (!objectKey) {
		if (/^https:\/\//i.test(raw))
			return {
				state: "ready",
				message: "El archivo está disponible mediante el enlace seguro registrado.",
			}
		return {
			state: "unavailable",
			message: "La referencia del archivo no corresponde a un almacenamiento permitido.",
		}
	}
	const storage = storageFor(raw)
	if (!storage)
		return {
			state: "unavailable",
			message: "El almacenamiento seguro de documentos no está configurado en este entorno.",
		}
	try {
		await storage.client.send(
			new HeadObjectCommand({
				Bucket: storage.bucket,
				Key: objectKey,
			})
		)
		return {
			state: "ready",
			message: "Archivo disponible para revisión con MFA y acceso auditado.",
		}
	} catch {
		return {
			state: "unavailable",
			message:
				"La referencia existe, pero el archivo ya no está disponible en almacenamiento seguro.",
		}
	}
}

export async function uploadProviderDocumentObject(params: {
	providerId: string
	documentId: string
	fileName: string
	mimeType: string
	body: Buffer | Uint8Array
}): Promise<{ objectKey: string; fileUrl: string }> {
	if (!isR2DocumentStorageConfigured()) {
		const error = new Error("document_storage_not_configured")
		;(error as Error & { status?: number }).status = 503
		throw error
	}
	const bucket = documentStorageConfig()!.bucket
	const objectKey = buildProviderDocumentObjectKey(params)
	const integrity = documentIntegrity(params.body, params.mimeType)
	try {
		await getDocumentR2Client().send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				Body: Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body),
				ContentType: params.mimeType,
				ContentLength: integrity.byteSize,
				IfNoneMatch: "*",
				Metadata: { sha256: integrity.sha256 },
			}),
			{ abortSignal: AbortSignal.timeout(60_000) }
		)
	} catch (error) {
		// PUT may have succeeded even when its acknowledgement was lost. Never overwrite it.
		const head = await getDocumentR2Client()
			.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }), {
				abortSignal: AbortSignal.timeout(10_000),
			})
			.catch(() => null)
		if (
			!head ||
			head.ContentLength !== integrity.byteSize ||
			head.Metadata?.sha256 !== integrity.sha256 ||
			head.ContentType !== params.mimeType
		)
			throw error
	}
	return { objectKey, fileUrl: toProviderDocumentFileRef(objectKey) }
}

export async function createProviderDocumentPreviewUrl(params: {
	fileUrl: string
	expiresInSeconds?: number
}): Promise<string | null> {
	const objectKey = parseProviderDocumentObjectKey(params.fileUrl)
	if (!objectKey) {
		const raw = String(params.fileUrl ?? "").trim()
		if (/^https?:\/\//i.test(raw)) return raw
		return null
	}
	const storage = storageFor(params.fileUrl)
	if (!storage) return null
	const availability = await inspectProviderDocumentPreview({ fileUrl: params.fileUrl })
	if (availability.state !== "ready") return null
	return getSignedUrl(
		storage.client,
		new GetObjectCommand({
			Bucket: storage.bucket,
			Key: objectKey,
		}),
		{ expiresIn: params.expiresInSeconds ?? 300 }
	)
}

/** Internal worker access. Unlike reviewer preview this does not assert the
 * inspection verdict because it is the input used to produce that verdict. */
export async function createProviderDocumentProcessingUrl(params: {
	fileUrl: string
	expiresInSeconds?: number
}): Promise<string | null> {
	const objectKey = parseProviderDocumentObjectKey(params.fileUrl)
	const storage = storageFor(params.fileUrl)
	if (!objectKey || !storage) return null
	return getSignedUrl(
		storage.client,
		new GetObjectCommand({ Bucket: storage.bucket, Key: objectKey }),
		{ expiresIn: params.expiresInSeconds ?? 300 }
	)
}

export async function readProviderDocumentObject(params: {
	fileUrl: string
	maxBytes?: number
}): Promise<Buffer> {
	const objectKey = parseProviderDocumentObjectKey(params.fileUrl)
	const storage = storageFor(params.fileUrl)
	if (!objectKey || !storage) {
		const error = new Error("document_processing_source_unavailable")
		;(error as Error & { status?: number }).status = 404
		throw error
	}
	const response = await storage.client.send(
		new GetObjectCommand({ Bucket: storage.bucket, Key: objectKey })
	)
	if (!response.Body) throw new Error("document_processing_source_empty")
	const bytes = Buffer.from(await response.Body.transformToByteArray())
	if (bytes.byteLength > (params.maxBytes ?? 12 * 1024 * 1024))
		throw new Error("document_processing_source_too_large")
	return bytes
}
