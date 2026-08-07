import type { APIRoute } from "astro"

import { retryProviderIntegrationSyncRun } from "@/lib/channel-manager/channel-manager-recovery"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"

export const prerender = false

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const runId = String(params.runId ?? "").trim()
		if (!runId) throw new Error("INTEGRATION_SYNC_RUN_NOT_FOUND")
		const job = await retryProviderIntegrationSyncRun({
			providerId: auth.providerId,
			runId,
			requestedBy: auth.user.id,
		})
		return Response.json(
			{ ok: true, job, message: "Reintento programado. Puedes seguir su avance aquí." },
			{ status: 202, headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INTEGRATION_SYNC_RETRY_FAILED"
		return Response.json({ error: mapProviderIntegrationError(message) }, { status: 400 })
	}
}
