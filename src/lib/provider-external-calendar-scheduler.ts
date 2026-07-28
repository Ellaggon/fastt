import { timingSafeEqual } from "node:crypto"

import {
	and,
	db,
	eq,
	ne,
	ProviderExternalCalendar,
	ProviderIntegrationSyncJob,
	sql,
} from "@/shared/infrastructure/db/compat"
import {
	refreshExternalCalendarConnectionRollup,
	syncProviderExternalCalendar,
	type ExternalCalendarSyncTrigger,
} from "@/lib/provider-external-calendars"
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

export type ExternalCalendarScheduledSyncResult = {
	claimed: number
	enqueued: number
	succeeded: number
	failed: number
	durationMs: number
	items: Array<{
		calendarId: string
		jobId: string
		status: "succeeded" | "failed"
		errorCode?: string
	}>
}

export function externalCalendarSchedulerConfig() {
	return {
		batchSize: boundedInteger(
			process.env.EXTERNAL_CALENDAR_SYNC_BATCH_SIZE,
			DEFAULT_BATCH_SIZE,
			1,
			100
		),
		concurrency: boundedInteger(
			process.env.EXTERNAL_CALENDAR_SYNC_CONCURRENCY,
			DEFAULT_CONCURRENCY,
			1,
			8
		),
		providerLimit: boundedInteger(
			process.env.EXTERNAL_CALENDAR_SYNC_PROVIDER_LIMIT,
			DEFAULT_PROVIDER_LIMIT,
			1,
			10
		),
	}
}

export function externalCalendarRetryMinutes(
	consecutiveFailures: number,
	syncIntervalMinutes: number
): number {
	const attempt = Math.max(1, Math.trunc(consecutiveFailures) + 1)
	const exponential = 15 * 2 ** Math.min(attempt - 1, 5)
	return Math.min(Math.max(15, exponential), Math.min(Math.max(15, syncIntervalMinutes), 360))
}

/** @deprecated Prefer providerSyncJobRetryMinutes from provider-sync-job-queue. */
export function externalCalendarJobRetryMinutes(attempts: number): number {
	return providerSyncJobRetryMinutes(attempts)
}

export function verifyCronAuthorization(
	authorization: string | null,
	secret = process.env.CRON_SECRET
): "authorized" | "unauthorized" | "misconfigured" {
	const expectedSecret = String(secret ?? "").trim()
	if (expectedSecret.length < 16) return "misconfigured"
	const provided = String(authorization ?? "")
	const expected = `Bearer ${expectedSecret}`
	const providedBuffer = Buffer.from(provided)
	const expectedBuffer = Buffer.from(expected)
	if (providedBuffer.length !== expectedBuffer.length) return "unauthorized"
	return timingSafeEqual(providedBuffer, expectedBuffer) ? "authorized" : "unauthorized"
}

export async function enqueueProviderExternalCalendarSyncJob(params: {
	providerId: string
	calendarId: string
	trigger?: ExternalCalendarSyncTrigger
	priority?: number
	runAfter?: Date
	idempotencyKey?: string | null
}): Promise<{ jobId: string; enqueued: boolean }> {
	const calendar = await db
		.select({
			id: ProviderExternalCalendar.id,
			providerId: ProviderExternalCalendar.providerId,
			connectionId: ProviderExternalCalendar.connectionId,
			status: ProviderExternalCalendar.status,
		})
		.from(ProviderExternalCalendar)
		.where(
			and(
				eq(ProviderExternalCalendar.id, params.calendarId),
				eq(ProviderExternalCalendar.providerId, params.providerId),
				ne(ProviderExternalCalendar.status, "revoked")
			)
		)
		.then((rows) => rows[0])
	if (!calendar) throw new Error("ICAL_CALENDAR_NOT_FOUND")
	const jobId = crypto.randomUUID()
	const now = new Date()
	const idempotencyKey =
		params.idempotencyKey ??
		`${params.trigger ?? "manual"}:${params.calendarId}:${now.toISOString()}:${jobId}`
	await db
		.insert(ProviderIntegrationSyncJob)
		.values({
			id: jobId,
			providerId: params.providerId,
			connectionId: calendar.connectionId ?? null,
			targetType: "external_calendar",
			targetId: params.calendarId,
			connectorKey: "external_calendars",
			operation: "calendar_import",
			status: "queued",
			trigger: params.trigger ?? "manual",
			priority: params.priority ?? 50,
			attempts: 0,
			maxAttempts: 5,
			runAfter: params.runAfter ?? now,
			idempotencyKey,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: [
				ProviderIntegrationSyncJob.targetType,
				ProviderIntegrationSyncJob.targetId,
				ProviderIntegrationSyncJob.idempotencyKey,
			],
		})
	const existing = await db
		.select({ id: ProviderIntegrationSyncJob.id })
		.from(ProviderIntegrationSyncJob)
		.where(
			and(
				eq(ProviderIntegrationSyncJob.targetType, "external_calendar"),
				eq(ProviderIntegrationSyncJob.targetId, params.calendarId),
				eq(ProviderIntegrationSyncJob.idempotencyKey, idempotencyKey)
			)
		)
		.then((rows) => rows[0])
	return { jobId: existing?.id ?? jobId, enqueued: existing?.id === jobId }
}

async function enqueueDueExternalCalendarSyncJobs(params: {
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
				"connectionId",
				"nextSyncAt"
			FROM "ProviderExternalCalendar"
			WHERE
				"syncEnabled" = TRUE
				AND "status" <> 'revoked'
				AND (${params.providerId ?? null}::text IS NULL OR "providerId" = ${params.providerId ?? null})
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
				"connectionId",
				'external_calendar',
				"id",
				'external_calendars',
				'calendar_import',
				'queued',
				'scheduled',
				100,
				0,
				5,
				${nowIso},
				'calendar:' || "id" || ':scheduled:' || "nextSyncAt"::text,
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

async function finishExternalCalendarSyncJob(params: {
	job: ClaimedProviderSyncJob
	leaseToken: string
	status: "succeeded" | "failed"
	errorCode?: string
}) {
	if (params.status === "succeeded") {
		await markProviderSyncJobSucceeded({ jobId: params.job.id, leaseToken: params.leaseToken })
		return
	}

	const { retryAt } = await markProviderSyncJobFailed({
		jobId: params.job.id,
		leaseToken: params.leaseToken,
		attempts: params.job.attempts,
		maxAttempts: params.job.maxAttempts,
		errorCode: params.errorCode ?? "ICAL_SYNC_FAILED",
	})
	const now = new Date()
	await db.execute(sql`
		UPDATE "ProviderExternalCalendar"
		SET
			"consecutiveFailures" = "consecutiveFailures" + 1,
			"nextSyncAt" = ${retryAt.toISOString()},
			"updatedAt" = ${now.toISOString()}
		WHERE "id" = ${params.job.targetId}
	`)
	await refreshExternalCalendarConnectionRollup(params.job.providerId)
}

export async function runScheduledExternalCalendarSync(options?: {
	now?: Date
	batchSize?: number
	concurrency?: number
	providerLimit?: number
	providerId?: string
	fetchImpl?: typeof fetch
}): Promise<ExternalCalendarScheduledSyncResult> {
	const startedAt = Date.now()
	const now = options?.now ?? new Date()
	const config = externalCalendarSchedulerConfig()
	const batchSize = boundedInteger(options?.batchSize, config.batchSize, 1, 100)
	const concurrency = boundedInteger(options?.concurrency, config.concurrency, 1, 8)
	const providerLimit = boundedInteger(options?.providerLimit, config.providerLimit, 1, 10)
	const leaseToken = crypto.randomUUID()
	const enqueued = await enqueueDueExternalCalendarSyncJobs({
		now,
		batchSize,
		providerId: options?.providerId,
	})
	const jobs = await claimQueuedProviderSyncJobs({
		now,
		batchSize,
		providerLimit,
		leaseToken,
		targetType: "external_calendar",
		providerId: options?.providerId,
	})
	const items = await mapWithConcurrency(jobs, concurrency, async (job) => {
		const calendarId = job.targetId
		try {
			await syncProviderExternalCalendar({
				providerId: job.providerId,
				calendarId,
				trigger: job.trigger as ExternalCalendarSyncTrigger,
				idempotencyKey: job.idempotencyKey,
				fetchImpl: options?.fetchImpl,
			})
			await finishExternalCalendarSyncJob({ job, leaseToken, status: "succeeded" })
			return { calendarId, jobId: job.id, status: "succeeded" as const }
		} catch (error) {
			const errorCode = error instanceof Error ? error.message.slice(0, 100) : "ICAL_SYNC_FAILED"
			await finishExternalCalendarSyncJob({ job, leaseToken, status: "failed", errorCode })
			return {
				calendarId,
				jobId: job.id,
				status: "failed" as const,
				errorCode,
			}
		}
	})
	return {
		claimed: jobs.length,
		enqueued,
		succeeded: items.filter((item) => item.status === "succeeded").length,
		failed: items.filter((item) => item.status === "failed").length,
		durationMs: Date.now() - startedAt,
		items,
	}
}
