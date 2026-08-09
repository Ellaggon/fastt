import type { APIRoute } from "astro"

import {
	enqueueProviderInitialAriSync,
	getProviderInitialAriStatus,
} from "@/lib/channel-manager/channel-manager-initial-ari"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import { runScheduledProviderIntegrationSync } from "@/lib/provider-integration-scheduler"

export const prerender = false
export const maxDuration = 300

function dateValue(value: Date | null | undefined) {
	return value instanceof Date ? value.toISOString() : null
}

export const GET: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = String(params.connectionId ?? "").trim()
		if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED")
		const status = await getProviderInitialAriStatus({
			providerId: auth.providerId,
			connectionId,
		})
		return Response.json(
			{
				environment: status.environment,
				job: status.job
					? {
							...status.job,
							updatedAt: dateValue(status.job.updatedAt),
						}
					: null,
				run: status.run
					? {
							...status.run,
							errorMessage: status.run.errorMessage
								? mapProviderIntegrationError(String(status.run.errorMessage))
								: null,
							startedAt: dateValue(status.run.startedAt),
							finishedAt: dateValue(status.run.finishedAt),
						}
					: null,
			},
			{ headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INITIAL_ARI_STATUS_FAILED"
		return Response.json({ error: mapProviderIntegrationError(message) }, { status: 400 })
	}
}

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = String(params.connectionId ?? "").trim()
		if (!connectionId) throw new Error("CONNECTION_ID_REQUIRED")
		let certificationId: string | null = null
		if (request.headers.get("content-type")?.includes("application/json")) {
			const body = (await request.json()) as { certificationId?: unknown }
			certificationId = String(body.certificationId ?? "").trim() || null
		}
		const job = await enqueueProviderInitialAriSync({
			providerId: auth.providerId,
			connectionId,
			requestedBy: auth.user.id,
			certificationId,
		})
		const worker = await runScheduledProviderIntegrationSync({
			providerId: auth.providerId,
			batchSize: 1,
			concurrency: 1,
			providerLimit: 1,
		})
		return Response.json({ ok: worker.failed === 0, job, worker }, { status: 202 })
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INITIAL_ARI_SYNC_FAILED"
		return Response.json({ error: mapProviderIntegrationError(message) }, { status: 400 })
	}
}
