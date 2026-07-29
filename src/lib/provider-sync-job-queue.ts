import { and, db, eq, ProviderIntegrationSyncJob, sql } from "@/shared/infrastructure/db/compat"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"

export type ProviderSyncJobTargetType = "connection" | "external_calendar"

export type ClaimedProviderSyncJob = {
	id: string
	providerId: string
	connectionId: string | null
	targetType: ProviderSyncJobTargetType
	targetId: string
	connectorKey: string
	operation: string
	trigger: string
	attempts: number
	maxAttempts: number
	idempotencyKey: string
	payloadJson: unknown
	createdAt: Date
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/** Shared backoff for universal SyncJob retries (minutes). */
export function providerSyncJobRetryMinutes(attempts: number): number {
	const attempt = Math.max(1, Math.trunc(attempts))
	return Math.min(15 * 2 ** Math.min(attempt - 1, 6), 720)
}

export async function mapWithConcurrency<T, R>(
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

export async function claimQueuedProviderSyncJobs(params: {
	now: Date
	batchSize: number
	providerLimit: number
	leaseToken: string
	targetType: ProviderSyncJobTargetType
	providerId?: string
}): Promise<ClaimedProviderSyncJob[]> {
	const nowIso = params.now.toISOString()
	const claimed: ClaimedProviderSyncJob[] = []
	for (let round = 0; round < 3 && claimed.length < params.batchSize; round += 1) {
		const remaining = params.batchSize - claimed.length
		const candidateLimit = Math.min(
			4000,
			Math.max(remaining, remaining * Math.max(20, params.providerLimit * 8))
		)
		const rows = await db.execute(sql`
		WITH candidates AS (
			SELECT
				"id",
				"providerId",
				"priority",
				"runAfter",
				"createdAt"
			FROM "ProviderIntegrationSyncJob"
			WHERE
				"status" = 'queued'
				AND "targetType" = ${params.targetType}
				AND "runAfter" <= ${nowIso}
				AND (${params.providerId ?? null}::text IS NULL OR "providerId" = ${params.providerId ?? null})
			ORDER BY "priority" ASC, "runAfter" ASC, "createdAt" ASC
			LIMIT ${candidateLimit}
		),
		ranked AS (
			SELECT
				"id",
				"priority",
				"runAfter",
				"createdAt",
				row_number() OVER (
					PARTITION BY "providerId"
					ORDER BY "priority" ASC, "runAfter" ASC, "createdAt" ASC
				) AS provider_rank
			FROM candidates
		),
		due AS (
			SELECT job."id"
			FROM ranked
			INNER JOIN "ProviderIntegrationSyncJob" AS job ON job."id" = ranked."id"
			WHERE provider_rank <= ${params.providerLimit}
				AND job."status" = 'queued'
			ORDER BY ranked."priority" ASC, ranked."runAfter" ASC, ranked."createdAt" ASC
			LIMIT ${remaining}
			FOR UPDATE OF job SKIP LOCKED
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
			job."targetType",
			job."targetId",
			job."connectorKey",
			job."operation",
			job."trigger",
			job."attempts",
			job."maxAttempts",
			job."idempotencyKey",
			job."payloadJson",
			job."createdAt"
	`)
		const roundJobs = Array.from(rows as unknown as ClaimedProviderSyncJob[])
		claimed.push(...roundJobs)
		if (roundJobs.length === 0 && round > 0) break
	}
	for (const job of claimed) {
		observeTiming(
			"provider_integration_job_queue_latency_ms",
			Math.max(0, params.now.getTime() - new Date(job.createdAt).getTime()),
			{ target_type: job.targetType }
		)
		incrementCounter("provider_integration_jobs_claimed_total", {
			target_type: job.targetType,
		})
	}
	return claimed
}

export async function markProviderSyncJobSucceeded(params: {
	jobId: string
	leaseToken: string
	targetType?: ProviderSyncJobTargetType
}) {
	const now = new Date()
	const updated = await db
		.update(ProviderIntegrationSyncJob)
		.set({
			status: "succeeded",
			lastError: null,
			finishedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(ProviderIntegrationSyncJob.id, params.jobId),
				eq(ProviderIntegrationSyncJob.lockedBy, params.leaseToken)
			)
		)
		.returning({ id: ProviderIntegrationSyncJob.id })
	if (updated.length === 0) return
	incrementCounter("provider_integration_jobs_completed_total", {
		target_type: params.targetType ?? "unknown",
		status: "succeeded",
	})
}

export async function markProviderSyncJobFailed(params: {
	jobId: string
	leaseToken: string
	attempts: number
	maxAttempts: number
	errorCode?: string
	targetType?: ProviderSyncJobTargetType
}): Promise<{ terminal: boolean; retryAt: Date }> {
	const now = new Date()
	const attempts = Number(params.attempts ?? 0) + 1
	const terminal = attempts >= Number(params.maxAttempts ?? 5)
	const retryAt = new Date(now.getTime() + providerSyncJobRetryMinutes(attempts) * 60_000)
	const updated = await db
		.update(ProviderIntegrationSyncJob)
		.set({
			status: terminal ? "failed" : "queued",
			attempts,
			runAfter: terminal ? now : retryAt,
			lockedAt: null,
			lockedBy: null,
			lastError: params.errorCode ?? "PROVIDER_SYNC_FAILED",
			finishedAt: terminal ? now : null,
			updatedAt: now,
		})
		.where(
			and(
				eq(ProviderIntegrationSyncJob.id, params.jobId),
				eq(ProviderIntegrationSyncJob.lockedBy, params.leaseToken)
			)
		)
		.returning({ id: ProviderIntegrationSyncJob.id })
	if (updated.length === 0) return { terminal, retryAt }
	incrementCounter("provider_integration_job_attempt_failures_total", {
		target_type: params.targetType ?? "unknown",
		terminal,
	})
	if (!terminal) {
		incrementCounter("provider_integration_job_retries_total", {
			target_type: params.targetType ?? "unknown",
		})
	} else {
		incrementCounter("provider_integration_jobs_completed_total", {
			target_type: params.targetType ?? "unknown",
			status: "failed",
		})
	}
	return { terminal, retryAt }
}
