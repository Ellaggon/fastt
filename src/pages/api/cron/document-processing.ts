import type { APIRoute } from "astro"

import { runProviderDocumentProcessingWorker } from "@/lib/documents/document-processing"
export const config = { maxDuration: 60 }

function authorized(request: Request) {
	const workerToken = process.env.DOCUMENT_PROCESSING_WORKER_TOKEN?.trim()
	return [
		process.env.CRON_SECRET,
		workerToken && workerToken.length >= 32 ? workerToken : undefined,
	].some(
		(value) =>
			Boolean(value?.trim()) && request.headers.get("authorization") === `Bearer ${value!.trim()}`
	)
}

export const GET: APIRoute = async ({ request }) => {
	if (
		!process.env.CRON_SECRET?.trim() &&
		(process.env.DOCUMENT_PROCESSING_WORKER_TOKEN?.trim().length ?? 0) < 32
	)
		return Response.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 })
	if (!authorized(request))
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
	try {
		const result = await runProviderDocumentProcessingWorker({ limit: 1, maxElapsedMs: 45_000 })
		return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } })
	} catch {
		return Response.json({ ok: false, error: "document_processing_worker_failed" }, { status: 500 })
	}
}
