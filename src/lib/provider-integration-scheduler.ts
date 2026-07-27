import {
	and,
	db,
	eq,
	ProviderIntegrationConnection,
	ProviderIntegrationSyncJob,
	sql,
} from "@/shared/infrastructure/db/compat"
import { syncProviderIntegration } from "@/lib/provider-integrations"

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_CONCURRENCY = 3
const DEFAULT_PROVIDER_LIMIT = 3

type IntegrationSyncTrigger = "manual" | "scheduled" | "webhook" | "retry"

type ClaimedIntegrationJob = {
	id: string
	providerId: string
	connectionId: string
	connectorKey: string
	operation: string
	trigger: IntegrationSyncTrigger
	attempts: number
	maxAttempts: number
	idempotencyKey: string
}

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

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(parsed)))
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

export function providerIntegrationJobRetryMinutes(attempts: number): number {
	const attempt = Math.max(1, Math.trunc(attempts))
	return Math.min(15 * 2 ** Math.min(attempt - 1, 6), 720)
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
			ON CONFLICT ("connectionId", "idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT count(*)::int AS "count" FROM inserted
	`)
	const count = Array.from(rows as unknown as Array<{ count: number | string }>)[0]?.count ?? 0
	return Number(count)
}

async function claimQueuedProviderIntegrationSyncJobs(params: {
	now: Date
	batchSize: number
	providerLimit: number
	leaseToken: string
	providerId?: string
}): Promise<ClaimedIntegrationJob[]> {
	const nowIso = params.now.toISOString()
	const rows = await db.execute(sql`
		WITH ranked AS (
			SELECT
				"id",
				row_number() OVER (
					PARTITION BY "providerId"
					ORDER BY "priority" ASC, "runAfter" ASC, "createdAt" ASC
				) AS provider_rank
			FROM "ProviderIntegrationSyncJob"
			WHERE
				"status" = 'queued'
				AND "runAfter" <= ${nowIso}
				AND (${params.providerId ?? null}::text IS NULL OR "providerId" = ${params.providerId ?? null})
			ORDER BY "priority" ASC, "runAfter" ASC, "createdAt" ASC
		),
		due AS (
			SELECT "id"
			FROM ranked
			WHERE provider_rank <= ${params.providerLimit}
			LIMIT ${params.batchSize}
		)
		UPDATE "ProviderIntegrationSyncJob" AS job
		SET
			"status" = 'running',
			"lockedAt" = ${nowIso},
			"lockedBy" = ${params.leaseToken},
			"updatedAt" = ${nowIso}
		FROM due
		WHERE job."id" = due."id" AND job."status" = 'queued'
		RETURNING
			job."id",
			job."providerId",
			job."connectionId",
			job."connectorKey",
			job."operation",
			job."trigger",
			job."attempts",
			job."maxAttempts",
			job."idempotencyKey"
	`)
	return Array.from(rows as unknown as ClaimedIntegrationJob[])
}

async function finishProviderIntegrationSyncJob(params: {
	job: ClaimedIntegrationJob
	leaseToken: string
	status: "succeeded" | "failed"
	errorCode?: string
}) {
	const now = new Date()
	if (params.status === "succeeded") {
		await db
			.update(ProviderIntegrationSyncJob)
			.set({
				status: "succeeded",
				lastError: null,
				finishedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(ProviderIntegrationSyncJob.id, params.job.id),
					eq(ProviderIntegrationSyncJob.lockedBy, params.leaseToken)
				)
			)
		return
	}

	const attempts = Number(params.job.attempts ?? 0) + 1
	const terminal = attempts >= Number(params.job.maxAttempts ?? 5)
	const retryAt = new Date(now.getTime() + providerIntegrationJobRetryMinutes(attempts) * 60_000)
	await db
		.update(ProviderIntegrationConnection)
		.set({
			consecutiveFailures: sql`${ProviderIntegrationConnection.consecutiveFailures} + 1`,
			nextSyncAt: retryAt,
			updatedAt: now,
		})
		.where(eq(ProviderIntegrationConnection.id, params.job.connectionId))
	await db
		.update(ProviderIntegrationSyncJob)
		.set({
			status: terminal ? "failed" : "queued",
			attempts,
			runAfter: terminal ? now : retryAt,
			lockedAt: null,
			lockedBy: null,
			lastError: params.errorCode ?? "INTEGRATION_SYNC_FAILED",
			finishedAt: terminal ? now : null,
			updatedAt: now,
		})
		.where(
			and(
				eq(ProviderIntegrationSyncJob.id, params.job.id),
				eq(ProviderIntegrationSyncJob.lockedBy, params.leaseToken)
			)
		)
}

async function mapWithConcurrency<T, R>(
	values: T[],
	concurrency: number,
	mapper: (value: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(values.length)
	let cursor = 0
	const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (cursor < values.length) {
			const index = cursor
			cursor += 1
			results[index] = await mapper(values[index])
		}
	})
	await Promise.all(workers)
	return results
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
	const jobs = await claimQueuedProviderIntegrationSyncJobs({
		now,
		batchSize,
		providerLimit,
		leaseToken,
		providerId: options?.providerId,
	})
	const items = await mapWithConcurrency(jobs, concurrency, async (job) => {
		try {
			const result = await syncProviderIntegration({
				providerId: job.providerId,
				connectorKey: job.connectorKey,
				connectionId: job.connectionId,
				trigger: job.trigger,
				idempotencyKey: job.idempotencyKey,
			})
			if (result.status !== "connected") throw new Error("INTEGRATION_SYNC_NOT_CONNECTED")
			await finishProviderIntegrationSyncJob({ job, leaseToken, status: "succeeded" })
			return { connectionId: job.connectionId, jobId: job.id, status: "succeeded" as const }
		} catch (error) {
			const errorCode =
				error instanceof Error ? error.message.slice(0, 100) : "INTEGRATION_SYNC_FAILED"
			await finishProviderIntegrationSyncJob({ job, leaseToken, status: "failed", errorCode })
			return {
				connectionId: job.connectionId,
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
