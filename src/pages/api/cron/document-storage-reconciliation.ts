import type { APIRoute } from "astro"
import { auditProviderDocumentStorage } from "@/lib/documents/storage-reconciliation"

export const config = { maxDuration: 60 }
export const GET: APIRoute = async ({ request }) => {
	const secret = process.env.CRON_SECRET?.trim()
	if (!secret) return Response.json({ error: "cron_secret_not_configured" }, { status: 503 })
	if (request.headers.get("authorization") !== `Bearer ${secret}`)
		return Response.json({ error: "unauthorized" }, { status: 401 })
	try {
		const audit = await auditProviderDocumentStorage()
		const counts = { scanned: audit.scanned, orphanCandidates: 0, recentUnconfirmed: 0, unknown: 0 }
		for (const entry of audit.entries) {
			if (entry.state === "orphan_candidate") counts.orphanCandidates++
			if (entry.state === "recent_unconfirmed") counts.recentUnconfirmed++
			if (entry.state === "unknown_identity_or_age") counts.unknown++
		}
		if (counts.orphanCandidates || counts.unknown)
			console.warn("provider.document.storage_reconciliation_attention", counts)
		return Response.json({ ok: true, ...counts }, { headers: { "Cache-Control": "no-store" } })
	} catch {
		return Response.json({ error: "document_storage_reconciliation_failed" }, { status: 503 })
	}
}
