import type { APIRoute } from "astro"

import { runProviderDocumentProcessingWorker } from "@/lib/documents/document-processing"
import { auditProviderDocumentStorage } from "@/lib/documents/storage-reconciliation"
import { isR2DocumentStorageConfigured } from "@/lib/provider-document-storage"

function authorized(request: Request) {
	const secret = String(process.env.CRON_SECRET ?? "").trim()
	return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`
}

export const GET: APIRoute = async ({ request }) => {
	if (!process.env.CRON_SECRET?.trim())
		return Response.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 })
	if (!authorized(request))
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
	try {
		const result = await runProviderDocumentProcessingWorker({ limit: 10 })
		const audit = isR2DocumentStorageConfigured() ? await auditProviderDocumentStorage() : null
		const storage = audit
			? {
					scanned: audit.scanned,
					orphanCandidates: audit.entries.filter((entry) => entry.state === "orphan_candidate")
						.length,
					recentUnconfirmed: audit.entries.filter((entry) => entry.state === "recent_unconfirmed")
						.length,
					unknown: audit.entries.filter((entry) => entry.state === "unknown_identity_or_age")
						.length,
				}
			: { state: "not_configured" }
		if ((storage.orphanCandidates ?? 0) > 0 || (storage.unknown ?? 0) > 0)
			console.warn("provider.document.storage_reconciliation_attention", storage)
		return Response.json({ ok: true, ...result, storage })
	} catch {
		return Response.json({ ok: false, error: "document_processing_worker_failed" }, { status: 500 })
	}
}
