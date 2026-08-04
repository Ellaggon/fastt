import { db, eq, ProviderIntegrationConnection, sql } from "@/shared/infrastructure/db/compat"
import { syncProviderIntegration } from "@/lib/provider-integrations"
import { runProviderInitialAriSync } from "@/lib/channel-manager/channel-manager-initial-ari"
import {
	incrementalAriRetryMinutes,
	runProviderIncrementalAriSync,
} from "@/lib/channel-manager/channel-manager-incremental-ari"
import {
	INCREMENTAL_AVAILABILITY_OPERATION,
	INCREMENTAL_RATES_OPERATION,
} from "@/lib/channel-manager/channel-manager-incremental-queue"
import { ChannelManagerAdapterError } from "@/lib/channel-manager/channel-manager-adapter"
import {
	BOOKING_REVISION_FEED_OPERATION,
	runProviderBookingRevisionFeed,
} from "@/lib/channel-manager/channel-manager-booking-revisions"
import {
	boundedInteger,
	claimQueuedProviderSyncJobs,
	mapWithConcurrency,
	markProviderSyncJobFailed,
	markProviderSyncJobSucceeded,
	providerSyncJobRetryMinutes,
	updateProviderSyncJobProgress,
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

async function enqueueBookingRevisionFeedJobs(params: {
	now: Date
	batchSize: number
	providerId?: string
}): Promise<number> {
	const nowIso = params.now.toISOString()
	const minute = nowIso.slice(0, 16)
	const rows = await db.execute(sql`
		WITH eligible AS (
			SELECT "id", "providerId"
			FROM "ProviderIntegrationConnection"
			WHERE
				"connectorKey" = 'channel_manager'
				AND "status" <> 'revoked'
				AND "externalPropertyId" IS NOT NULL
				AND "lastSyncStatus" IN (
					'initial_ari_succeeded', 'incremental_ari_succeeded',
					'incremental_ari_partial', 'booking_revision_feed_succeeded',
					'booking_revision_feed_partial'
				)
				AND "syncEnabled" = TRUE
				AND (${params.providerId ?? null}::text IS NULL OR "providerId" = ${params.providerId ?? null})
			ORDER BY "id"
			LIMIT ${params.batchSize}
		), inserted AS (
			INSERT INTO "ProviderIntegrationSyncJob" (
				"id", "providerId", "connectionId", "targetType", "targetId", "connectorKey",
				"operation", "status", "trigger", "priority", "attempts", "maxAttempts",
				"runAfter", "idempotencyKey", "createdAt", "updatedAt"
			)
			SELECT
				gen_random_uuid()::text, "providerId", "id", 'connection', "id", 'channel_manager',
				${BOOKING_REVISION_FEED_OPERATION}, 'queued', 'scheduled', 5, 0, 8,
				${nowIso}, 'booking-feed:' || "id" || ':' || ${minute}, ${nowIso}, ${nowIso}
			FROM eligible
			ON CONFLICT ("targetType", "targetId", "idempotencyKey") DO NOTHING
			RETURNING "id"
		)
		SELECT count(*)::int AS "count" FROM inserted
	`)
	return Number(Array.from(rows as unknown as Array<{ count: number | string }>)[0]?.count ?? 0)
}

async function finishProviderIntegrationSyncJob(params: {
	job: ClaimedProviderSyncJob
	leaseToken: string
	status: "succeeded" | "failed"
	errorCode?: string
	retryMinutes?: number
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
		retryMinutes: params.retryMinutes,
	})
	if (params.job.connectionId && params.job.operation === "connection_test") {
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
	const [scheduledConnections, bookingFeeds] = await Promise.all([
		enqueueDueProviderIntegrationSyncJobs({ now, batchSize, providerId: options?.providerId }),
		enqueueBookingRevisionFeedJobs({ now, batchSize, providerId: options?.providerId }),
	])
	const enqueued = scheduledConnections + bookingFeeds
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
			if (job.operation === "initial_ari_sync") {
				const payload =
					job.payloadJson && typeof job.payloadJson === "object"
						? (job.payloadJson as Record<string, unknown>)
						: {}
				await runProviderInitialAriSync({
					providerId: job.providerId,
					connectionId,
					requestedBy: String(payload.requestedBy ?? "").trim() || null,
					trigger: job.trigger as "manual" | "scheduled" | "webhook" | "retry",
					idempotencyKey: `${job.idempotencyKey}:attempt:${Number(job.attempts ?? 0) + 1}`,
					onProgress: (progress) =>
						updateProviderSyncJobProgress({
							jobId: job.id,
							leaseToken,
							progress,
						}),
				})
			} else if (
				job.operation === INCREMENTAL_AVAILABILITY_OPERATION ||
				job.operation === INCREMENTAL_RATES_OPERATION
			) {
				await runProviderIncrementalAriSync({
					providerId: job.providerId,
					connectionId,
					operation: job.operation,
					idempotencyKey: `${job.idempotencyKey}:attempt:${Number(job.attempts ?? 0) + 1}`,
					payload: job.payloadJson,
					trigger: job.trigger as "manual" | "scheduled" | "webhook" | "retry",
					now,
				})
			} else if (job.operation === BOOKING_REVISION_FEED_OPERATION) {
				await runProviderBookingRevisionFeed({
					providerId: job.providerId,
					connectionId,
					idempotencyKey: `${job.idempotencyKey}:attempt:${Number(job.attempts ?? 0) + 1}`,
					trigger: job.trigger as "manual" | "scheduled" | "webhook" | "retry",
				})
			} else {
				const result = await syncProviderIntegration({
					providerId: job.providerId,
					connectorKey: job.connectorKey,
					connectionId,
					trigger: job.trigger as "manual" | "scheduled" | "webhook" | "retry",
					idempotencyKey: job.idempotencyKey,
				})
				if (result.status !== "connected") throw new Error("INTEGRATION_SYNC_NOT_CONNECTED")
			}
			await finishProviderIntegrationSyncJob({ job, leaseToken, status: "succeeded" })
			return { connectionId, jobId: job.id, status: "succeeded" as const }
		} catch (error) {
			const errorCode =
				error instanceof Error ? error.message.slice(0, 100) : "INTEGRATION_SYNC_FAILED"
			const retryableInitialAriFailure =
				job.operation === "initial_ari_sync" &&
				error instanceof ChannelManagerAdapterError &&
				error.retryable
			const incrementalOperation =
				job.operation === INCREMENTAL_AVAILABILITY_OPERATION ||
				job.operation === INCREMENTAL_RATES_OPERATION
			const retryableIncrementalFailure =
				incrementalOperation && error instanceof ChannelManagerAdapterError && error.retryable
			const bookingFeedOperation = job.operation === BOOKING_REVISION_FEED_OPERATION
			const retryableBookingFeedFailure =
				bookingFeedOperation && error instanceof ChannelManagerAdapterError && error.retryable
			await finishProviderIntegrationSyncJob({
				job:
					(job.operation === "initial_ari_sync" && !retryableInitialAriFailure) ||
					(incrementalOperation && !retryableIncrementalFailure) ||
					(bookingFeedOperation && !retryableBookingFeedFailure)
						? { ...job, maxAttempts: Number(job.attempts ?? 0) + 1 }
						: job,
				leaseToken,
				status: "failed",
				errorCode,
				retryMinutes:
					retryableIncrementalFailure || retryableBookingFeedFailure
						? incrementalAriRetryMinutes(Number(job.attempts ?? 0) + 1)
						: undefined,
			})
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
