import type { APIRoute } from "astro"

import { runProviderDocumentProcessingWorker } from "@/lib/documents/document-processing"

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
		return Response.json({ ok: true, ...result })
	} catch {
		return Response.json({ ok: false, error: "document_processing_worker_failed" }, { status: 500 })
	}
}
