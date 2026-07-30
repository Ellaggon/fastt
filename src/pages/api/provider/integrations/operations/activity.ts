import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import { listProviderIntegrationExecutionActivity } from "@/lib/provider-integration-operations"
import { isProviderIntegrationWorkspaceConnector } from "@/lib/provider-integrations"

function dateValue(value: Date | null) {
	return value instanceof Date ? value.toISOString() : null
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const auth = await requireProvider(request)
		const url = new URL(request.url)
		const connectionId = url.searchParams.get("connectionId")?.trim() || null
		const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
		const pageSize = Math.min(
			25,
			Math.max(5, Number.parseInt(url.searchParams.get("pageSize") ?? "10", 10) || 10)
		)
		const activity = await listProviderIntegrationExecutionActivity({
			providerId: auth.providerId,
			connectionId,
			page,
			pageSize,
		})
		const runs = activity.runs.filter((run) =>
			isProviderIntegrationWorkspaceConnector(run.connectorKey)
		)
		const jobs = activity.jobs.filter((job) =>
			isProviderIntegrationWorkspaceConnector(job.connectorKey)
		)
		return Response.json(
			{
				runs: runs.map((run) => ({
					id: run.id,
					connectorKey: String(run.connectorKey),
					operation: String(run.operation),
					trigger: String(run.trigger),
					status: String(run.status),
					readCount: Number(run.readCount ?? 0),
					changedCount: Number(run.changedCount ?? 0),
					skippedCount: Number(run.skippedCount ?? 0),
					failedCount: Number(run.failedCount ?? 0),
					errorMessage: run.errorMessage
						? mapProviderIntegrationError(String(run.errorMessage))
						: null,
					startedAt: dateValue(run.startedAt),
					finishedAt: dateValue(run.finishedAt),
				})),
				jobs: jobs.map((job) => ({
					id: job.id,
					connectorKey: String(job.connectorKey),
					operation: String(job.operation),
					status: String(job.status),
					trigger: String(job.trigger),
					attempts: Number(job.attempts ?? 0),
					maxAttempts: Number(job.maxAttempts ?? 0),
					runAfter: dateValue(job.runAfter),
					updatedAt: dateValue(job.updatedAt),
				})),
				pagination: activity.pagination,
			},
			{
				headers: {
					"Cache-Control": "private, no-store",
				},
			}
		)
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INTEGRATION_ACTIVITY_ERROR"
		return Response.json({ error: mapProviderIntegrationError(message) }, { status: 400 })
	}
}
