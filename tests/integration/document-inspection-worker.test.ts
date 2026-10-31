import { createHash, randomUUID } from "node:crypto"
import { expect, it, vi } from "vitest"
import {
	db,
	eq,
	ProviderDocument,
	ProviderDocumentInspection,
	ProviderDocumentProcessingJob,
} from "@/shared/infrastructure/db/compat"
import { upsertProvider } from "../test-support/catalog-db-test-data"

const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")
vi.mock("@/lib/provider-document-storage", async (original) => ({
	...(await original<typeof import("@/lib/provider-document-storage")>()),
	readProviderDocumentObject: async () => bytes,
	createProviderDocumentProcessingUrl: async () => "https://isolated-storage.test/synthetic.pdf",
}))
import {
	assertProviderDocumentSafeToReveal,
	documentInspectionGate,
	getProviderDocumentInspection,
	runProviderDocumentProcessingWorker,
} from "@/lib/documents/document-processing"

it("keeps receipt, technical analysis and human approval separate, including retries", async () => {
	const providerId = "provider_inspection_worker"
	const documentId = `document_inspection_${randomUUID()}`
	await upsertProvider({
		id: providerId,
		legalName: "Synthetic inspection",
		displayName: "Synthetic inspection",
	})
	await db.insert(ProviderDocument).values({
		id: documentId,
		providerId,
		type: "business_registration",
		status: "pending",
		fileUrl: `r2-documents:provider-documents/${providerId}/${documentId}/original`,
		metadataJson: {
			mimeType: "application/pdf",
			integrity: {
				version: 1,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				byteSize: bytes.length,
			},
		},
	})
	const before = process.env.DOCUMENT_ANALYSIS_GATEWAY_URL
	const token = process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN
	const fetchBefore = globalThis.fetch
	try {
		delete process.env.DOCUMENT_ANALYSIS_GATEWAY_URL
		delete process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN
		await runProviderDocumentProcessingWorker({ gatewayMode: "disabled" })
		let inspection = await getProviderDocumentInspection(documentId)
		expect(inspection?.errorCode).toBe("document_analysis_gateway_not_configured")
		expect(inspection?.processingState).toBe("awaiting_configuration")
		expect(documentInspectionGate(inspection).canReveal).toBe(false)
		await expect(assertProviderDocumentSafeToReveal(documentId)).rejects.toMatchObject({
			status: 423,
		})
		process.env.DOCUMENT_ANALYSIS_GATEWAY_URL = "https://analysis.test/inspect"
		process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN = "synthetic-only-token-not-a-real-secret"
		let malware = "error"
		globalThis.fetch = vi.fn(async () =>
			Response.json({
				malware: { status: malware, engine: "synthetic-fixture" },
				ocr: { status: "completed", provider: "synthetic-fixture" },
				extraction: { status: "completed", fields: [] },
				tamper: { status: "clear", signals: [] },
				qualitySignals: {},
			})
		) as typeof fetch
		await runProviderDocumentProcessingWorker()
		inspection = await getProviderDocumentInspection(documentId)
		expect(inspection?.processingState).toBe("queued")
		expect(documentInspectionGate(inspection).canReveal).toBe(false)
		const [retry] = await db
			.select()
			.from(ProviderDocumentProcessingJob)
			.where(eq(ProviderDocumentProcessingJob.documentId, documentId))
		expect(retry.status).toBe("retry")
		expect(retry.lastErrorCode).toBe("document_analysis_incomplete")
		malware = "clean"
		await db
			.update(ProviderDocumentProcessingJob)
			.set({ availableAt: new Date(0) })
			.where(eq(ProviderDocumentProcessingJob.documentId, documentId))
		await runProviderDocumentProcessingWorker()
		inspection = await getProviderDocumentInspection(documentId)
		expect(inspection?.processingState).toBe("completed")
		expect(documentInspectionGate(inspection).canReveal).toBe(true)
		await expect(assertProviderDocumentSafeToReveal(documentId)).resolves.toBeUndefined()
		const [document] = await db
			.select()
			.from(ProviderDocument)
			.where(eq(ProviderDocument.id, documentId))
		expect(document.status).toBe("pending")
		expect(document.reviewedAt).toBeNull()
	} finally {
		globalThis.fetch = fetchBefore
		if (before === undefined) delete process.env.DOCUMENT_ANALYSIS_GATEWAY_URL
		else process.env.DOCUMENT_ANALYSIS_GATEWAY_URL = before
		if (token === undefined) delete process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN
		else process.env.DOCUMENT_ANALYSIS_GATEWAY_TOKEN = token
		await db
			.delete(ProviderDocumentProcessingJob)
			.where(eq(ProviderDocumentProcessingJob.documentId, documentId))
		await db
			.delete(ProviderDocumentInspection)
			.where(eq(ProviderDocumentInspection.documentId, documentId))
		await db.delete(ProviderDocument).where(eq(ProviderDocument.id, documentId))
	}
})
