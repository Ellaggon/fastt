import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import {
	loadProviderComplianceConsole,
	parseProviderComplianceQueueFilter,
} from "@/lib/provider-admin-compliance"

/**
 * Unified compliance queue summary for internal ops.
 * Mirrors Airbnb Trust & Safety / Expedia partner-ops work queues.
 */
export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalAdmin(request)
		const url = new URL(request.url)
		const filter = parseProviderComplianceQueueFilter(url.searchParams.get("filter"))
		const consolePayload = await loadProviderComplianceConsole({
			filter,
			auditLimit: Number(url.searchParams.get("auditLimit") ?? 40) || 40,
		})

		return new Response(
			JSON.stringify({
				ok: true,
				filter: consolePayload.filter,
				counts: consolePayload.counts,
				sections: consolePayload.sections,
				verification: consolePayload.verification,
				fiscal: consolePayload.fiscal,
				documents: consolePayload.documents,
				payments: consolePayload.payments,
				audit: consolePayload.audit,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (e) {
		if (e instanceof Response) return e
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
