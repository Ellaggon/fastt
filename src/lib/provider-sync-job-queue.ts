import { and, db, eq, ProviderIntegrationSyncJob, sql } from "@/shared/infrastructure/db/compat"

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
				AND "targetType" = ${params.targetType}
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
			job."targetType",
			job."targetId",
			job."connectorKey",
			job."operation",
			job."trigger",
			job."attempts",
			job."maxAttempts",
			job."idempotencyKey",
			job."payloadJson"
	`)
	return Array.from(rows as unknown as ClaimedProviderSyncJob[])
}

export async function markProviderSyncJobSucceeded(params: { jobId: string; leaseToken: string }) {
	const now = new Date()
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
				eq(ProviderIntegrationSyncJob.id, params.jobId),
				eq(ProviderIntegrationSyncJob.lockedBy, params.leaseToken)
			)
		)
}

export async function markProviderSyncJobFailed(params: {
	jobId: string
	leaseToken: string
	attempts: number
	maxAttempts: number
	errorCode?: string
}): Promise<{ terminal: boolean; retryAt: Date }> {
	const now = new Date()
	const attempts = Number(params.attempts ?? 0) + 1
	const terminal = attempts >= Number(params.maxAttempts ?? 5)
	const retryAt = new Date(now.getTime() + providerSyncJobRetryMinutes(attempts) * 60_000)
	await db
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
	return { terminal, retryAt }
}
