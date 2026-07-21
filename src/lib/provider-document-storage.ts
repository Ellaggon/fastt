import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { r2 } from "@/container/shared.container"

const OBJECT_PREFIX = "provider-documents"

export function isR2DocumentStorageConfigured(): boolean {
	return Boolean(
		process.env.R2_BUCKET_NAME?.trim() &&
		process.env.R2_ACCOUNT_ID?.trim() &&
		process.env.R2_ACCESS_KEY_ID?.trim() &&
		process.env.R2_SECRET_ACCESS_KEY?.trim()
	)
}

export function allowLegacyLocalDocumentUrls(): boolean {
	// Tests and local without R2 may still use local:// placeholders.
	if (process.env.VITEST) return true
	return !isR2DocumentStorageConfigured()
}

export function buildProviderDocumentObjectKey(params: {
	providerId: string
	documentId: string
	fileName: string
}): string {
	const safeName = String(params.fileName || "document")
		.replace(/[^a-zA-Z0-9._-]+/g, "_")
		.slice(0, 120)
	return `${OBJECT_PREFIX}/${params.providerId}/${params.documentId}/${safeName}`
}

export function toProviderDocumentFileRef(objectKey: string): string {
	return `r2:${objectKey}`
}

export function parseProviderDocumentObjectKey(fileUrl: string | null | undefined): string | null {
	const raw = String(fileUrl ?? "").trim()
	if (!raw) return null
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
	if (raw.startsWith("r2:")) return
	const publicBase = String(process.env.R2_PUBLIC_BASE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	if (publicBase && raw.startsWith(`${publicBase}/`)) return
	if (/^https:\/\//i.test(raw) && !isR2DocumentStorageConfigured()) return
	const error = new Error("invalid_document_storage_url")
	;(error as Error & { status?: number }).status = 400
	throw error
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
	const bucket = process.env.R2_BUCKET_NAME!
	const objectKey = buildProviderDocumentObjectKey(params)
	await r2.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: objectKey,
			Body: params.body,
			ContentType: params.mimeType,
		})
	)
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
	if (!isR2DocumentStorageConfigured()) return null
	return getSignedUrl(
		r2,
		new GetObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME!,
			Key: objectKey,
		}),
		{ expiresIn: params.expiresInSeconds ?? 300 }
	)
}
