import { randomUUID } from "node:crypto"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getDocumentR2Client } from "@/container/shared.container"
import { documentStorageConfig } from "@/lib/documents/storage-config"
import { documentIntegrity } from "@/lib/documents/object-integrity"
import { documentSubmissionId } from "@/lib/documents/upload-contract"
import {
	buildProviderDocumentObjectKey,
	createDirectDocumentUpload,
	confirmDirectDocumentUpload,
} from "@/lib/provider-document-storage"

const config = documentStorageConfig()
if (
	!process.argv.includes("--development") ||
	process.env.VERCEL ||
	process.env.NODE_ENV === "production" ||
	!config?.bucket.endsWith("-development")
)
	throw new Error("development_document_bucket_required")
const providerId = `direct-upload-certification-${randomUUID()}`
const key = randomUUID()
const pdf = Buffer.from(
	await readFile(
		new URL("../../services/document-analysis/fixtures/synthetic.pdf.b64", import.meta.url),
		"utf8"
	),
	"base64"
)
// Exercise a payload larger than the application Function request-body limit.
const bytes = Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024, 32)])
const integrity = documentIntegrity(bytes, "application/pdf")
const input = {
	idempotencyKey: key,
	fileName: "synthetic-large.pdf",
	mimeType: "application/pdf",
	sizeBytes: bytes.length,
	sha256: integrity.sha256,
}
const objectKey = buildProviderDocumentObjectKey({
	providerId,
	documentId: documentSubmissionId(providerId, key),
	fileName: input.fileName,
})
let browserHarness: URL | undefined
try {
	const signed = await createDirectDocumentUpload(providerId, input)
	let corsResponseVerified: boolean | null = null
	if (process.argv.includes("--browser")) {
		browserHarness = new URL(`../../public/__document-upload-${randomUUID()}.html`, import.meta.url)
		const setup = JSON.stringify({ ...signed, pdf: pdf.toString("base64") }).replaceAll(
			"<",
			"\\u003c"
		)
		await writeFile(
			browserHarness,
			`<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba sintética R2</title><main><h1>Prueba sintética de carga directa</h1><p>PDF sintético de 5 MB. No registra ni aprueba documentos.</p><button>Probar carga</button><p role="status">Preparado</p></main><script type="module">const setup=${setup}; document.querySelector('button').onclick=async()=>{ const status=document.querySelector('[role=status]'); status.textContent='Subiendo…'; try{ const pdf=Uint8Array.from(atob(setup.pdf),c=>c.charCodeAt(0));const bytes=new Uint8Array(pdf.length+5*1024*1024);bytes.fill(32);bytes.set(pdf);const response=await fetch(setup.signedUrl,{method:'PUT',headers:setup.headers,body:new Blob([bytes],{type:'application/pdf'}),credentials:'omit',redirect:'error'});if(!response.ok)throw Error();status.textContent='Carga directa confirmada en el navegador';}catch{status.textContent='Error de carga o CORS';}};</script></html>`,
			{ flag: "wx", mode: 0o600 }
		)
		console.log(
			`Open http://localhost:4321/${browserHarness.pathname.split("/").pop()} and press Probar carga`
		)
		let found = false
		for (let attempt = 0; attempt < 90; attempt++) {
			const head = await getDocumentR2Client()
				.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
				.catch((error) => {
					if (error.$metadata?.httpStatusCode === 404) return null
					throw error
				})
			if (head) {
				found = true
				break
			}
			await delay(2000)
		}
		if (!found) throw new Error("synthetic_browser_upload_timeout")
	} else {
		const response = await fetch(signed.signedUrl, {
			method: "PUT",
			headers: { ...signed.headers, Origin: "http://localhost:4321" },
			body: bytes,
			redirect: "error",
			signal: AbortSignal.timeout(60_000),
		})
		if (!response.ok) throw new Error(`synthetic_direct_upload_http_${response.status}`)
		corsResponseVerified =
			response.headers.get("access-control-allow-origin") === "http://localhost:4321"
		if (!corsResponseVerified) throw new Error("development_upload_cors_not_confirmed")
	}
	const confirmed = await confirmDirectDocumentUpload(providerId, input)
	if (!confirmed.bytes.equals(bytes)) throw new Error("synthetic_integrity_failed")
	const replay = await fetch(signed.signedUrl, {
		method: "PUT",
		headers: signed.headers,
		body: bytes,
		redirect: "error",
		signal: AbortSignal.timeout(60_000),
	})
	if (replay.status !== 412) throw new Error("immutable_upload_not_enforced")
	console.log(
		JSON.stringify({
			syntheticOnly: true,
			byteSize: bytes.length,
			directUpload: true,
			integrityVerified: true,
			overwriteBlocked: true,
			corsResponseVerified,
			browserTransportRequested: Boolean(browserHarness),
			browserResultRequiresVisualCheck: Boolean(browserHarness),
		})
	)
} finally {
	if (browserHarness) await unlink(browserHarness)
	// A lost PUT acknowledgement is uncertain, not proof the synthetic object is absent.
	const head = await getDocumentR2Client()
		.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
		.catch((error) => {
			if (error.$metadata?.httpStatusCode === 404) return null
			throw error
		})
	if (head) {
		if (
			!objectKey.startsWith(`provider-documents/${providerId}/`) ||
			head.Metadata?.sha256 !== integrity.sha256
		)
			throw new Error("unsafe_synthetic_cleanup")
		await getDocumentR2Client().send(
			new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey })
		)
	}
}
