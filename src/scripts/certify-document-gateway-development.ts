import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getDocumentR2Client } from "@/container/shared.container"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import {
	uploadProviderDocumentObject,
	createProviderDocumentProcessingUrl,
} from "@/lib/provider-document-storage"

const endpoint = new URL(process.env.DOCUMENT_ANALYSIS_GATEWAY_URL ?? "https://invalid")
if (!process.argv.includes("--development") || endpoint.origin !== "http://127.0.0.1:4319")
	throw new Error("local_development_gateway_required")
const config = documentStorageConfig()
if (!config) throw new Error("document_storage_not_configured")
const token = process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN!
const providerId = `gateway-certification-${randomUUID()}`
const objects: Array<{ key: string; sha256: string }> = []
const pdf = Buffer.from(
	await readFile(
		new URL("../../services/document-analysis/fixtures/synthetic.pdf.b64", import.meta.url),
		"utf8"
	),
	"base64"
)
const results: Record<string, unknown> = {}
async function analyze(
	body: Buffer,
	name: string,
	expectedStatus: number,
	expectedMalware?: string
) {
	const documentId = `${name}-${randomUUID()}`
	const integrity = documentIntegrity(body, "application/pdf")
	const object = await uploadProviderDocumentObject({
		providerId,
		documentId,
		fileName: "synthetic.pdf",
		mimeType: "application/pdf",
		body,
	})
	objects.push({ key: object.objectKey, sha256: integrity.sha256 })
	const sourceUrl = await createProviderDocumentProcessingUrl({ fileUrl: object.fileUrl })
	const input = {
		documentId,
		sourceUrl,
		sha256: integrity.sha256,
		mimeType: "application/pdf",
		documentType: "business_registration",
	}
	const started = Date.now()
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"authorization": `Bearer ${token}`,
			"content-type": "application/json",
			"idempotency-key": `document-analysis:${documentId}:${input.sha256}`,
		},
		body: JSON.stringify(input),
		signal: AbortSignal.timeout(45_000),
	})
	const result = await response.json()
	if (
		response.status !== expectedStatus ||
		(expectedMalware && result.malware?.status !== expectedMalware)
	)
		throw new Error(
			`certification_failed:${name}:${response.status}:${result.error ?? result.malware?.status}`
		)
	results[name] = {
		status: response.status,
		malware: result.malware?.status,
		ocr: result.ocr?.status,
		extraction: result.extraction?.status,
		durationMs: Date.now() - started,
	}
	return { input, result }
}
try {
	const unauthenticated = await fetch(new URL("/health", endpoint))
	if (unauthenticated.status !== 401) throw new Error("unauthenticated_access_not_denied")
	const clean = await analyze(pdf, "clean", 200, "clean")
	if (clean.result.ocr?.status !== "completed") throw new Error("synthetic_ocr_not_completed")
	// Official harmless antivirus test marker; never a customer document.
	await analyze(
		Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"),
		"antivirus-test",
		200,
		"infected"
	)
	await analyze(Buffer.from("%PDF-1.4\nnot a valid PDF\n%%EOF"), "invalid-pdf", 422)
	const hash = "0".repeat(64)
	const mismatch = await fetch(endpoint, {
		method: "POST",
		headers: {
			"authorization": `Bearer ${token}`,
			"content-type": "application/json",
			"idempotency-key": `document-analysis:${clean.input.documentId}:${hash}`,
		},
		body: JSON.stringify({ ...clean.input, sha256: hash }),
	})
	if (mismatch.status !== 422) throw new Error("hash_mismatch_not_denied")
	results.hashMismatch = { status: mismatch.status }
	console.log(
		JSON.stringify(
			{
				environment: "development",
				realAntivirus: true,
				realPrivateR2: true,
				syntheticOnly: true,
				results,
			},
			null,
			2
		)
	)
} finally {
	for (const object of objects) {
		if (!object.key.startsWith(`provider-documents/${providerId}/`))
			throw new Error("unsafe_certification_cleanup")
		const head = await getDocumentR2Client().send(
			new HeadObjectCommand({ Bucket: config.bucket, Key: object.key })
		)
		if (head.Metadata?.sha256 !== object.sha256)
			throw new Error("certification_cleanup_hash_mismatch")
		await getDocumentR2Client().send(
			new DeleteObjectCommand({ Bucket: config.bucket, Key: object.key })
		)
	}
}
