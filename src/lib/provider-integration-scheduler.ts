import { db, eq, ProviderIntegrationConnection, sql } from "@/shared/infrastructure/db/compat"
import { syncProviderIntegration } from "@/lib/provider-integrations"
import {
	boundedInteger,
	claimQueuedProviderSyncJobs,
	mapWithConcurrency,
	markProviderSyncJobFailed,
	markProviderSyncJobSucceeded,
	providerSyncJobRetryMinutes,
	type ClaimedProviderSyncJob,
} from "@/lib/provider-sync-job-queue"

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_CONCURRENCY = 3
const DEFAULT_PROVIDER_LIMIT = 3

export type ProviderIntegrationWorkerResult = {
	enqueued: number
	claimed: number
	succeeded: number
	failed: number
	durationMs: number
	items: Array<{
		connectionId: string
		jobId: string
		status: "succeeded" | "failed"
		errorCode?: string
	}>
}

export function providerIntegrationSchedulerConfig() {
	return {
		batchSize: boundedInteger(
			process.env.PROVIDER_INTEGRATION_SYNC_BATCH_SIZE,
			DEFAULT_BATCH_SIZE,
			1,
			100
		),
		concurrency: boundedInteger(
			process.env.PROVIDER_INTEGRATION_SYNC_CONCURRENCY,
			DEFAULT_CONCURRENCY,
			1,
			8
		),
		providerLimit: boundedInteger(
			process.env.PROVIDER_INTEGRATION_SYNC_PROVIDER_LIMIT,
			DEFAULT_PROVIDER_LIMIT,
			1,
			10
		),
	}
}

/** @deprecated Prefer providerSyncJobRetryMinutes from provider-sync-job-queue. */
export function providerIntegrationJobRetryMinutes(attempts: number): number {
	return providerSyncJobRetryMinutes(attempts)
}

async function enqueueDueProviderIntegrationSyncJobs(params: {
	now: Date
	batchSize: number
	providerId?: string
}): Promise<number> {
	const nowIso = params.now.toISOString()
	const rows = await db.execute(sql`
		WITH due AS (
			SELECT
				"id",
				"providerId",
				"connectorKey",
				"nextSyncAt"
			FROM "ProviderIntegrationConnection"
			WHERE
				"syncEnabled" = TRUE
				AND "status" <> 'revoked'
				AND "connectorKey" <> 'external_calendars'
				AND (${params.providerId ?? null}::text IS NULL OR "providerId" = ${params.providerId ?? null})
				AND "nextSyncAt" IS NOT NULL
				AND "nextSyncAt" <= ${nowIso}
			ORDER BY "nextSyncAt" ASC, "id" ASC
			LIMIT ${params.batchSize}
		),
		inserted AS (
			INSERT INTO "ProviderIntegrationSyncJob" (
				"id",
				"providerId",
				"connectionId",
				"targetType",
				"targetId",
				"connectorKey",
				"operation",
				"status",
				"trigger",
				"priority",
				"attempts",
				"maxAttempts",
				"runAfter",
				"idempotencyKey",
				"createdAt",
				"updatedAt"
			)
			SELECT
				gen_random_uuid()::text,
				"providerId",
				"id",
				'connection',
				"id",
				"connectorKey",
				'connection_test',
				'queued',
				'scheduled',
				100,
				0,
				5,
				${nowIso},
				'connection:' || "id" || ':scheduled:' || "nextSyncAt"::text,
				${nowIso},
				${nowIso}
			FROM due
			ON CONFLICT ("targetType", "targetId", "idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT count(*)::int AS "count" FROM inserted
	`)
	const count = Array.from(rows as unknown as Array<{ count: number | string }>)[0]?.count ?? 0
	return Number(count)
}

async function finishProviderIntegrationSyncJob(params: {
	job: ClaimedProviderSyncJob
	leaseToken: string
	status: "succeeded" | "failed"
	errorCode?: string
}) {
	if (params.status === "succeeded") {
		await markProviderSyncJobSucceeded({
			jobId: params.job.id,
			leaseToken: params.leaseToken,
			targetType: params.job.targetType,
		})
		return
	}

	const { retryAt } = await markProviderSyncJobFailed({
		jobId: params.job.id,
		leaseToken: params.leaseToken,
		attempts: params.job.attempts,
		maxAttempts: params.job.maxAttempts,
		errorCode: params.errorCode ?? "INTEGRATION_SYNC_FAILED",
		targetType: params.job.targetType,
	})
	if (params.job.connectionId) {
		const now = new Date()
		await db
			.update(ProviderIntegrationConnection)
			.set({
				consecutiveFailures: sql`${ProviderIntegrationConnection.consecutiveFailures} + 1`,
				nextSyncAt: retryAt,
				updatedAt: now,
			})
			.where(eq(ProviderIntegrationConnection.id, params.job.connectionId))
	}
}

export async function runScheduledProviderIntegrationSync(options?: {
	now?: Date
	batchSize?: number
	concurrency?: number
	providerLimit?: number
	providerId?: string
}): Promise<ProviderIntegrationWorkerResult> {
	const startedAt = Date.now()
	const now = options?.now ?? new Date()
	const config = providerIntegrationSchedulerConfig()
	const batchSize = boundedInteger(options?.batchSize, config.batchSize, 1, 100)
	const concurrency = boundedInteger(options?.concurrency, config.concurrency, 1, 8)
	const providerLimit = boundedInteger(options?.providerLimit, config.providerLimit, 1, 10)
	const leaseToken = crypto.randomUUID()
	const enqueued = await enqueueDueProviderIntegrationSyncJobs({
		now,
		batchSize,
		providerId: options?.providerId,
	})
	const jobs = await claimQueuedProviderSyncJobs({
		now,
		batchSize,
		providerLimit,
		leaseToken,
		targetType: "connection",
		providerId: options?.providerId,
	})
	const items = await mapWithConcurrency(jobs, concurrency, async (job) => {
		const connectionId = String(job.connectionId ?? job.targetId)
		try {
			const result = await syncProviderIntegration({
				providerId: job.providerId,
				connectorKey: job.connectorKey,
				connectionId,
				trigger: job.trigger as "manual" | "scheduled" | "webhook" | "retry",
				idempotencyKey: job.idempotencyKey,
			})
			if (result.status !== "connected") throw new Error("INTEGRATION_SYNC_NOT_CONNECTED")
			await finishProviderIntegrationSyncJob({ job, leaseToken, status: "succeeded" })
			return { connectionId, jobId: job.id, status: "succeeded" as const }
		} catch (error) {
			const errorCode =
				error instanceof Error ? error.message.slice(0, 100) : "INTEGRATION_SYNC_FAILED"
			await finishProviderIntegrationSyncJob({ job, leaseToken, status: "failed", errorCode })
			return {
				connectionId,
				jobId: job.id,
				status: "failed" as const,
				errorCode,
			}
		}
	})
	return {
		enqueued,
		claimed: jobs.length,
		succeeded: items.filter((item) => item.status === "succeeded").length,
		failed: items.filter((item) => item.status === "failed").length,
		durationMs: Date.now() - startedAt,
		items,
	}
}
