import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import { runScheduledProviderIntegrationSync } from "@/lib/provider-integration-scheduler"
import {
	flushProviderChannelManagerIncrementalJobs,
	setProviderChannelManagerSyncEnabled,
} from "@/lib/provider-integrations"

export const prerender = false
export const maxDuration = 300

const headers = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
}

function json(body: unknown, status = 200) {
	return Response.json(body, { status, headers })
}

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = String(params.connectionId ?? "").trim()
		if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED")
		if (!request.headers.get("content-type")?.includes("application/json")) {
			return json({ error: "JSON_BODY_REQUIRED" }, 415)
		}
		const body = (await request.json()) as { action?: unknown }
		const action = String(body.action ?? "")
		if (action === "pause" || action === "resume") {
			const result = await setProviderChannelManagerSyncEnabled({
				providerId: auth.providerId,
				currentUserId: auth.user.id,
				connectionId,
				enabled: action === "resume",
			})
			return json({ ok: true, action, ...result })
		}
		if (action === "sync_now") {
			const result = await flushProviderChannelManagerIncrementalJobs({
				providerId: auth.providerId,
				connectionId,
			})
			if (result.queuedChanges === 0) {
				return json({ ok: true, action, ...result, message: "No hay cambios pendientes." })
			}
			const worker = await runScheduledProviderIntegrationSync({
				providerId: auth.providerId,
				batchSize: Math.min(20, Math.max(4, result.queuedChanges + 2)),
				concurrency: 2,
				providerLimit: 4,
			})
			return json({ ok: worker.failed === 0, action, ...result, worker }, 202)
		}
		return json({ error: "INTEGRATION_OPERATION_INVALID" }, 400)
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INTEGRATION_OPERATION_FAILED"
		return json({ error: mapProviderIntegrationError(message) }, 400)
	}
}
