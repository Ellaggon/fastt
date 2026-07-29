import { db, sql } from "@/shared/infrastructure/db/compat"
import { logger } from "@/lib/observability/logger"
import { incrementCounter, observeTiming } from "@/lib/observability/metrics"
import { boundedInteger } from "@/lib/provider-sync-job-queue"

const DAY_MS = 86_400_000

export type ProviderIntegrationRetentionPolicy = {
	inactiveEventDays: number
	endedEventDays: number
	successfulRunDays: number
	failedRunDays: number
	successfulJobDays: number
	failedJobDays: number
	batchSize: number
}

export type ProviderIntegrationPurgeResult = {
	policy: ProviderIntegrationRetentionPolicy
	inactiveEvents: number
	endedEvents: number
	successfulRuns: number
	failedRuns: number
	successfulJobs: number
	failedJobs: number
	totalPurged: number
	durationMs: number
}

function retentionDays(value: unknown, fallback: number): number {
	return boundedInteger(value, fallback, 1, 3650)
}

export function providerIntegrationRetentionPolicy(): ProviderIntegrationRetentionPolicy {
	return {
		inactiveEventDays: retentionDays(
			process.env.PROVIDER_INTEGRATION_INACTIVE_EVENT_RETENTION_DAYS,
			30
		),
		endedEventDays: retentionDays(process.env.PROVIDER_INTEGRATION_ENDED_EVENT_RETENTION_DAYS, 180),
		successfulRunDays: retentionDays(
			process.env.PROVIDER_INTEGRATION_SUCCESSFUL_RUN_RETENTION_DAYS,
			90
		),
		failedRunDays: retentionDays(process.env.PROVIDER_INTEGRATION_FAILED_RUN_RETENTION_DAYS, 180),
		successfulJobDays: retentionDays(
			process.env.PROVIDER_INTEGRATION_SUCCESSFUL_JOB_RETENTION_DAYS,
			14
		),
		failedJobDays: retentionDays(process.env.PROVIDER_INTEGRATION_FAILED_JOB_RETENTION_DAYS, 90),
		batchSize: boundedInteger(process.env.PROVIDER_INTEGRATION_PURGE_BATCH_SIZE, 1000, 10, 5000),
	}
}

function cutoff(now: Date, days: number): string {
	return new Date(now.getTime() - days * DAY_MS).toISOString()
}

function dateCutoff(now: Date, days: number): string {
	return cutoff(now, days).slice(0, 10)
}

function deletedCount(rows: unknown): number {
	return Array.from(rows as ArrayLike<unknown>).length
}

export async function purgeProviderIntegrationOperationalData(options?: {
	now?: Date
	policy?: Partial<ProviderIntegrationRetentionPolicy>
	providerId?: string
}): Promise<ProviderIntegrationPurgeResult> {
	const startedAt = Date.now()
	const now = options?.now ?? new Date()
	const defaults = providerIntegrationRetentionPolicy()
	const policy: ProviderIntegrationRetentionPolicy = {
		inactiveEventDays: retentionDays(
			options?.policy?.inactiveEventDays,
			defaults.inactiveEventDays
		),
		endedEventDays: retentionDays(options?.policy?.endedEventDays, defaults.endedEventDays),
		successfulRunDays: retentionDays(
			options?.policy?.successfulRunDays,
			defaults.successfulRunDays
		),
		failedRunDays: retentionDays(options?.policy?.failedRunDays, defaults.failedRunDays),
		successfulJobDays: retentionDays(
			options?.policy?.successfulJobDays,
			defaults.successfulJobDays
		),
		failedJobDays: retentionDays(options?.policy?.failedJobDays, defaults.failedJobDays),
		batchSize: boundedInteger(options?.policy?.batchSize, defaults.batchSize, 10, 5000),
	}
	const batchSize = policy.batchSize

	const inactiveEvents = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderExternalCalendarEvent"
				WHERE "isActive" = FALSE
					AND "lastSeenAt" < ${cutoff(now, policy.inactiveEventDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "lastSeenAt" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderExternalCalendarEvent" AS event
			USING candidates
			WHERE event."id" = candidates."id"
			RETURNING event."id"
		`)
	)
	const endedEvents = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderExternalCalendarEvent"
				WHERE "endDate" < ${dateCutoff(now, policy.endedEventDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "endDate" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderExternalCalendarEvent" AS event
			USING candidates
			WHERE event."id" = candidates."id"
			RETURNING event."id"
		`)
	)
	const successfulRuns = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderIntegrationSyncRun"
				WHERE "status" IN ('succeeded', 'cancelled')
					AND "finishedAt" < ${cutoff(now, policy.successfulRunDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "finishedAt" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderIntegrationSyncRun" AS run
			USING candidates
			WHERE run."id" = candidates."id"
			RETURNING run."id"
		`)
	)
	const failedRuns = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderIntegrationSyncRun"
				WHERE "status" IN ('failed', 'partial')
					AND "finishedAt" < ${cutoff(now, policy.failedRunDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "finishedAt" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderIntegrationSyncRun" AS run
			USING candidates
			WHERE run."id" = candidates."id"
			RETURNING run."id"
		`)
	)
	const successfulJobs = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderIntegrationSyncJob"
				WHERE "status" = 'succeeded'
					AND "finishedAt" < ${cutoff(now, policy.successfulJobDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "finishedAt" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderIntegrationSyncJob" AS job
			USING candidates
			WHERE job."id" = candidates."id"
			RETURNING job."id"
		`)
	)
	const failedJobs = deletedCount(
		await db.execute(sql`
			WITH candidates AS (
				SELECT "id"
				FROM "ProviderIntegrationSyncJob"
				WHERE "status" = 'failed'
					AND "finishedAt" < ${cutoff(now, policy.failedJobDays)}
					AND (${options?.providerId ?? null}::text IS NULL OR "providerId" = ${options?.providerId ?? null})
				ORDER BY "finishedAt" ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM "ProviderIntegrationSyncJob" AS job
			USING candidates
			WHERE job."id" = candidates."id"
			RETURNING job."id"
		`)
	)
	const totalPurged =
		inactiveEvents + endedEvents + successfulRuns + failedRuns + successfulJobs + failedJobs
	const durationMs = Date.now() - startedAt
	const result = {
		policy,
		inactiveEvents,
		endedEvents,
		successfulRuns,
		failedRuns,
		successfulJobs,
		failedJobs,
		totalPurged,
		durationMs,
	}

	for (const [entity, count] of Object.entries({
		inactive_event: inactiveEvents,
		ended_event: endedEvents,
		successful_run: successfulRuns,
		failed_run: failedRuns,
		successful_job: successfulJobs,
		failed_job: failedJobs,
	})) {
		if (count > 0) incrementCounter("provider_integration_purged_rows_total", { entity }, count)
	}
	observeTiming("provider_integration_purge_duration_ms", durationMs)
	logger.info("provider_integration_operational_data_purged", result)
	return result
}
