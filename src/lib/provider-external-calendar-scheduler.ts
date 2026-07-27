import { timingSafeEqual } from "node:crypto"

import {
	and,
	db,
	eq,
	ne,
	ProviderExternalCalendar,
	ProviderExternalCalendarSyncJob,
	sql,
} from "@/shared/infrastructure/db/compat"
import {
	syncProviderExternalCalendar,
	type ExternalCalendarSyncTrigger,
} from "@/lib/provider-external-calendars"

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_CONCURRENCY = 3
const DEFAULT_PROVIDER_LIMIT = 3

type ClaimedJob = {
	id: string
	providerId: string
	calendarId: string
	connectionId: string | null
	trigger: ExternalCalendarSyncTrigger
	attempts: number
	maxAttempts: number
	idempotencyKey: string
}

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

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(parsed)))
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

export function externalCalendarJobRetryMinutes(attempts: number): number {
	const attempt = Math.max(1, Math.trunc(attempts))
	return Math.min(15 * 2 ** Math.min(attempt - 1, 6), 720)
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
		.insert(ProviderExternalCalendarSyncJob)
		.values({
			id: jobId,
			providerId: params.providerId,
			calendarId: params.calendarId,
			connectionId: calendar.connectionId ?? null,
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
		.onConflictDoNothing()
	const existing = await db
		.select({ id: ProviderExternalCalendarSyncJob.id })
		.from(ProviderExternalCalendarSyncJob)
		.where(
			and(
				eq(ProviderExternalCalendarSyncJob.calendarId, params.calendarId),
				eq(ProviderExternalCalendarSyncJob.idempotencyKey, idempotencyKey)
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
			INSERT INTO "ProviderExternalCalendarSyncJob" (
				"id",
				"providerId",
				"calendarId",
				"connectionId",
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
				"connectionId",
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
			ON CONFLICT ("calendarId", "idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT count(*)::int AS "count" FROM inserted
	`)
	const count = Array.from(rows as unknown as Array<{ count: number | string }>)[0]?.count ?? 0
	return Number(count)
}

async function claimQueuedExternalCalendarSyncJobs(params: {
	now: Date
	batchSize: number
	providerLimit: number
	leaseToken: string
	providerId?: string
}): Promise<ClaimedJob[]> {
	const nowIso = params.now.toISOString()
	const rows = await db.execute(sql`
		WITH ranked AS (
			SELECT
				"id",
				row_number() OVER (
					PARTITION BY "providerId"
					ORDER BY "priority" ASC, "runAfter" ASC, "createdAt" ASC
				) AS provider_rank
			FROM "ProviderExternalCalendarSyncJob"
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
		UPDATE "ProviderExternalCalendarSyncJob" AS job
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
			job."calendarId",
			job."connectionId",
			job."trigger",
			job."attempts",
			job."maxAttempts",
			job."idempotencyKey"
	`)
	return Array.from(rows as unknown as ClaimedJob[])
}

async function finishJob(params: {
	job: ClaimedJob
	leaseToken: string
	status: "succeeded" | "failed"
	errorCode?: string
}) {
	const now = new Date()
	if (params.status === "succeeded") {
		await db
			.update(ProviderExternalCalendarSyncJob)
			.set({
				status: "succeeded",
				lastError: null,
				finishedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(ProviderExternalCalendarSyncJob.id, params.job.id),
					eq(ProviderExternalCalendarSyncJob.lockedBy, params.leaseToken)
				)
			)
		return
	}

	const attempts = Number(params.job.attempts ?? 0) + 1
	const terminal = attempts >= Number(params.job.maxAttempts ?? 5)
	const retryAt = new Date(now.getTime() + externalCalendarJobRetryMinutes(attempts) * 60_000)
	await db.execute(sql`
		UPDATE "ProviderExternalCalendar"
		SET
			"consecutiveFailures" = "consecutiveFailures" + 1,
			"nextSyncAt" = ${retryAt.toISOString()},
			"syncLeaseToken" = NULL,
			"syncLeaseUntil" = NULL,
			"updatedAt" = ${now.toISOString()}
		WHERE "id" = ${params.job.calendarId}
	`)
	await db
		.update(ProviderExternalCalendarSyncJob)
		.set({
			status: terminal ? "failed" : "queued",
			attempts,
			runAfter: terminal ? now : retryAt,
			lockedAt: null,
			lockedBy: null,
			lastError: params.errorCode ?? "ICAL_SYNC_FAILED",
			finishedAt: terminal ? now : null,
			updatedAt: now,
		})
		.where(
			and(
				eq(ProviderExternalCalendarSyncJob.id, params.job.id),
				eq(ProviderExternalCalendarSyncJob.lockedBy, params.leaseToken)
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
	const jobs = await claimQueuedExternalCalendarSyncJobs({
		now,
		batchSize,
		providerLimit,
		leaseToken,
		providerId: options?.providerId,
	})
	const items = await mapWithConcurrency(jobs, concurrency, async (job) => {
		try {
			await syncProviderExternalCalendar({
				providerId: job.providerId,
				calendarId: job.calendarId,
				trigger: job.trigger,
				idempotencyKey: job.idempotencyKey,
				fetchImpl: options?.fetchImpl,
			})
			await finishJob({ job, leaseToken, status: "succeeded" })
			return { calendarId: job.calendarId, jobId: job.id, status: "succeeded" as const }
		} catch (error) {
			const errorCode = error instanceof Error ? error.message.slice(0, 100) : "ICAL_SYNC_FAILED"
			await finishJob({ job, leaseToken, status: "failed", errorCode })
			return {
				calendarId: job.calendarId,
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
