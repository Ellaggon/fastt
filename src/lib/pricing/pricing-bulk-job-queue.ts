import { randomUUID } from "node:crypto"

import { db, sql } from "@/shared/infrastructure/db/compat"
import type { PricingRuleMaterializationResult } from "@/modules/pricing/public"

export type ClaimedPricingBulkJob = {
	id: string
	providerId: string
	requestedByUserId: string
	commandJson: unknown
	operationType: "create_pricing_rule" | "preview_pricing_rule"
	attempts: number
	maxAttempts: number
	finalizationAttempts: number
	finalizationMaxAttempts: number
	materializationCompletedAt: Date | string | null
	cacheInvalidationCompletedAt: Date | string | null
	ariEnqueueCompletedAt: Date | string | null
	status: "running" | "finalizing"
	createdAt: Date | string
}

export type ClaimedPricingBulkItem = {
	id: string
	jobId: string
	ratePlanId: string
	productIdSnapshot: string
	variantIdSnapshot: string
	attempts: number
}

type JobCounts = {
	pending: number
	running: number
	succeeded: number
	failed: number
	skipped: number
	cancelled: number
}

export type PricingBulkQueueSnapshot = {
	jobs: {
		queued: number
		due: number
		running: number
		finalizing: number
		requiresAttention: number
		retrying: number
	}
	items: {
		queued: number
		running: number
		failed: number
	}
}

export function pricingBulkJobLeaseToken() {
	return `pricing-bulk-worker:${randomUUID()}`
}

export function pricingBulkRetryDelayMs(attempts: number): number {
	const attempt = Math.max(1, Math.trunc(attempts))
	return Math.min(30_000 * 2 ** Math.min(attempt - 1, 7), 3_600_000)
}

function rows<T>(value: unknown): T[] {
	return Array.from(value as ArrayLike<T>)
}

async function countsForJob(
	jobId: string,
	executor: Pick<typeof db, "execute"> = db
): Promise<JobCounts> {
	const [result] = rows<{
		pending: number | string
		running: number | string
		succeeded: number | string
		failed: number | string
		skipped: number | string
		cancelled: number | string
	}>(
		await executor.execute(sql`
			SELECT
				count(*) FILTER (WHERE "status" = 'queued') AS pending,
				count(*) FILTER (WHERE "status" = 'running') AS running,
				count(*) FILTER (WHERE "status" = 'succeeded') AS succeeded,
				count(*) FILTER (WHERE "status" = 'failed') AS failed,
				count(*) FILTER (WHERE "status" = 'skipped') AS skipped,
				count(*) FILTER (WHERE "status" = 'cancelled') AS cancelled
			FROM "PricingBulkOperationItem"
			WHERE "jobId" = ${jobId}
		`)
	)
	return {
		pending: Number(result?.pending ?? 0),
		running: Number(result?.running ?? 0),
		succeeded: Number(result?.succeeded ?? 0),
		failed: Number(result?.failed ?? 0),
		skipped: Number(result?.skipped ?? 0),
		cancelled: Number(result?.cancelled ?? 0),
	}
}

export async function recoverExpiredPricingBulkJobLeases(params: {
	now: Date
	leaseMs: number
}): Promise<number> {
	const cutoff = new Date(params.now.getTime() - params.leaseMs).toISOString()
	return db.transaction(async (tx) => {
		const expired = rows<{
			id: string
			attempts: number
			maxAttempts: number
			finalizationAttempts: number
			finalizationMaxAttempts: number
			status: "running" | "finalizing"
		}>(
			await tx.execute(sql`
				SELECT "id", "attempts", "maxAttempts", "finalizationAttempts", "finalizationMaxAttempts", "status"
				FROM "PricingBulkOperationJob"
				WHERE "status" IN ('running', 'finalizing') AND "lockedAt" < ${cutoff}
				ORDER BY "lockedAt" ASC
				FOR UPDATE SKIP LOCKED
			`)
		)
		for (const job of expired) {
			if (job.status === "finalizing") {
				const nextFinalizationAttempts = Math.min(
					Number(job.finalizationAttempts) + 1,
					Number(job.finalizationMaxAttempts)
				)
				const exhausted = nextFinalizationAttempts >= Number(job.finalizationMaxAttempts)
				const retryAt = new Date(
					params.now.getTime() + pricingBulkRetryDelayMs(nextFinalizationAttempts)
				)
				await tx.execute(sql`
					UPDATE "PricingBulkOperationJob"
					SET
						"status" = ${exhausted ? "requires_attention" : "finalizing"},
						"lockedAt" = NULL,
						"lockedBy" = NULL,
						"runAfter" = ${exhausted ? params.now.toISOString() : retryAt.toISOString()},
						"finalizationAttempts" = ${nextFinalizationAttempts},
						"finalizationErrorCode" = 'worker_lease_expired',
						"finalizationErrorDetail" = 'El proceso de finalización anterior perdió su lease antes de terminar.',
						"finalErrorCode" = ${exhausted ? "pricing_bulk_finalization_requires_attention" : "pricing_bulk_finalization_retry_pending"},
						"finalErrorDetail" = ${exhausted ? "La finalización agotó sus reintentos y requiere revisión." : "La finalización comercial se reintentará de forma segura."},
						"requiresAttentionAt" = ${exhausted ? params.now.toISOString() : null}
					WHERE "id" = ${job.id}
				`)
				continue
			}
			const nextAttempts = Number(job.attempts) + 1
			const exhausted = nextAttempts >= Number(job.maxAttempts)
			await tx.execute(sql`
				UPDATE "PricingBulkOperationItem"
				SET
					"status" = ${exhausted ? "failed" : "queued"},
					"attempts" = ${nextAttempts},
					"errorCode" = 'worker_lease_expired',
					"errorDetail" = 'El proceso anterior perdió su lease antes de terminar.',
					"finishedAt" = ${exhausted ? params.now.toISOString() : null}
				WHERE "jobId" = ${job.id} AND "status" = 'running'
			`)
			const counts = await countsForJob(String(job.id), tx)
			await tx.execute(sql`
				UPDATE "PricingBulkOperationJob"
				SET
					"status" = ${exhausted ? "failed" : "queued"},
					"pendingItems" = ${counts.pending},
					"runningItems" = ${counts.running},
					"completedItems" = ${counts.succeeded + counts.failed + counts.skipped + counts.cancelled},
					"succeededItems" = ${counts.succeeded},
					"failedItems" = ${counts.failed},
					"skippedItems" = ${counts.skipped},
					"cancelledItems" = ${counts.cancelled},
					"lockedAt" = NULL,
					"lockedBy" = NULL,
					"runAfter" = ${params.now.toISOString()},
					"finalErrorCode" = 'worker_lease_expired',
					"finalErrorDetail" = 'El proceso anterior perdió su lease antes de terminar.',
					"finishedAt" = ${exhausted ? params.now.toISOString() : null}
				WHERE "id" = ${job.id}
			`)
		}
		return expired.length
	})
}

/**
 * A single current view of durable work. The worker publishes this after every
 * run so operators can distinguish queued demand from retry or finalization work.
 */
export async function getPricingBulkQueueSnapshot(
	now: Date = new Date()
): Promise<PricingBulkQueueSnapshot> {
	const [jobRow] = rows<Record<string, number | string>>(
		await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE "status" = 'queued') AS queued,
				count(*) FILTER (WHERE "status" = 'queued' AND "runAfter" <= ${now.toISOString()}) AS due,
				count(*) FILTER (WHERE "status" = 'running') AS running,
				count(*) FILTER (WHERE "status" = 'finalizing') AS finalizing,
				count(*) FILTER (WHERE "status" = 'requires_attention') AS "requiresAttention",
				count(*) FILTER (
					WHERE ("status" = 'queued' AND "attempts" > 0)
						OR ("status" = 'finalizing' AND "finalizationAttempts" > 0)
				) AS retrying
			FROM "PricingBulkOperationJob"
		`)
	)
	const [itemRow] = rows<Record<string, number | string>>(
		await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE "status" = 'queued') AS queued,
				count(*) FILTER (WHERE "status" = 'running') AS running,
				count(*) FILTER (WHERE "status" = 'failed') AS failed
			FROM "PricingBulkOperationItem"
		`)
	)
	return {
		jobs: {
			queued: Number(jobRow?.queued ?? 0),
			due: Number(jobRow?.due ?? 0),
			running: Number(jobRow?.running ?? 0),
			finalizing: Number(jobRow?.finalizing ?? 0),
			requiresAttention: Number(jobRow?.requiresAttention ?? 0),
			retrying: Number(jobRow?.retrying ?? 0),
		},
		items: {
			queued: Number(itemRow?.queued ?? 0),
			running: Number(itemRow?.running ?? 0),
			failed: Number(itemRow?.failed ?? 0),
		},
	}
}

export async function claimQueuedPricingBulkJobs(params: {
	now: Date
	batchSize: number
	leaseToken: string
}): Promise<ClaimedPricingBulkJob[]> {
	const now = params.now.toISOString()
	return rows<ClaimedPricingBulkJob>(
		await db.execute(sql`
			WITH due AS (
				SELECT "id"
				FROM "PricingBulkOperationJob"
				WHERE (
						("status" = 'queued' AND "attempts" < "maxAttempts")
						OR ("status" = 'finalizing' AND "finalizationAttempts" < "finalizationMaxAttempts")
					)
					AND "lockedBy" IS NULL
					AND "runAfter" <= ${now}
				ORDER BY "runAfter" ASC, "createdAt" ASC
				LIMIT ${params.batchSize}
				FOR UPDATE SKIP LOCKED
			)
			UPDATE "PricingBulkOperationJob" AS job
			SET
				"status" = CASE WHEN job."status" = 'queued' THEN 'running' ELSE 'finalizing' END,
				"lockedAt" = ${now},
				"lockedBy" = ${params.leaseToken},
				"startedAt" = coalesce(job."startedAt", ${now}),
				"updatedAt" = ${now}
			FROM due
			WHERE job."id" = due."id"
			RETURNING job."id", job."providerId", job."requestedByUserId", job."commandJson", job."operationType", job."attempts", job."maxAttempts", job."finalizationAttempts", job."finalizationMaxAttempts", job."materializationCompletedAt", job."cacheInvalidationCompletedAt", job."ariEnqueueCompletedAt", job."status", job."createdAt"
		`)
	)
}

export async function checkpointPricingBulkMaterialization(params: {
	jobId: string
	leaseToken: string
	results: PricingRuleMaterializationResult[]
	now: Date
}): Promise<boolean> {
	return db.transaction(async (tx) => {
		for (const result of params.results) {
			await tx.execute(sql`
				UPDATE "PricingBulkOperationItem" AS item
				SET "materializationResultJson" = ${JSON.stringify({
					missingDatesCount: result.missingDatesCount,
					generatedDatesCount: result.generatedDatesCount,
					impact: result.impact,
				})}::jsonb,
					"updatedAt" = CURRENT_TIMESTAMP
				WHERE item."jobId" = ${params.jobId}
					AND item."ratePlanId" = ${result.impact.ratePlanId}
					AND item."status" = 'succeeded'
			`)
		}
		const updated = rows<{ id: string }>(
			await tx.execute(sql`
				UPDATE "PricingBulkOperationJob"
				SET "materializationCompletedAt" = ${params.now.toISOString()}, "updatedAt" = CURRENT_TIMESTAMP
				WHERE "id" = ${params.jobId}
					AND "status" = 'finalizing'
					AND "lockedBy" = ${params.leaseToken}
				RETURNING "id"
			`)
		)
		return updated.length > 0
	})
}

export async function checkpointPricingBulkEffect(params: {
	jobId: string
	leaseToken: string
	stage: "cache_invalidation" | "ari_enqueue"
	now: Date
}): Promise<boolean> {
	const column =
		params.stage === "cache_invalidation"
			? sql.raw('"cacheInvalidationCompletedAt"')
			: sql.raw('"ariEnqueueCompletedAt"')
	const updated = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET ${column} = ${params.now.toISOString()}, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.jobId}
				AND "status" = 'finalizing'
				AND "lockedBy" = ${params.leaseToken}
			RETURNING "id"
		`)
	)
	return updated.length > 0
}

/** Releases work claimed but not started when a bounded cron run reaches its deadline. */
export async function releasePricingBulkJobLease(params: {
	jobId: string
	leaseToken: string
	now: Date
}): Promise<boolean> {
	const released = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET
				"status" = CASE WHEN "status" = 'running' THEN 'queued' ELSE 'finalizing' END,
				"lockedAt" = NULL,
				"lockedBy" = NULL,
				"runAfter" = ${params.now.toISOString()},
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.jobId}
				AND "status" IN ('running', 'finalizing')
				AND "lockedBy" = ${params.leaseToken}
			RETURNING "id"
		`)
	)
	return released.length > 0
}

export async function claimPricingBulkJobItems(params: {
	jobId: string
	leaseToken: string
	batchSize: number
}): Promise<ClaimedPricingBulkItem[]> {
	return rows<ClaimedPricingBulkItem>(
		await db.execute(sql`
			WITH due AS (
				SELECT item."id"
				FROM "PricingBulkOperationItem" AS item
				INNER JOIN "PricingBulkOperationJob" AS job ON job."id" = item."jobId"
				WHERE item."jobId" = ${params.jobId}
					AND item."status" = 'queued'
					AND job."status" = 'running'
					AND job."lockedBy" = ${params.leaseToken}
				ORDER BY item."createdAt" ASC
				LIMIT ${params.batchSize}
				FOR UPDATE OF item SKIP LOCKED
			)
			UPDATE "PricingBulkOperationItem" AS item
			SET
				"status" = 'running',
				"attempts" = item."attempts" + 1,
				"startedAt" = coalesce(item."startedAt", CURRENT_TIMESTAMP),
				"updatedAt" = CURRENT_TIMESTAMP
			FROM due
			WHERE item."id" = due."id" AND item."status" = 'queued'
			RETURNING item."id", item."jobId", item."ratePlanId", item."productIdSnapshot", item."variantIdSnapshot", item."attempts"
		`)
	)
}

/**
 * Extends the job lease before a bounded worker batch. Item writes also verify this
 * token, so a recovered job cannot be completed by a stale worker.
 */
export async function refreshPricingBulkJobLease(params: {
	jobId: string
	leaseToken: string
	now: Date
}): Promise<boolean> {
	const updated = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET "lockedAt" = ${params.now.toISOString()}, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.jobId}
				AND "status" IN ('running', 'finalizing')
				AND "lockedBy" = ${params.leaseToken}
			RETURNING "id"
		`)
	)
	return updated.length > 0
}

export async function markPricingBulkItemSucceeded(params: {
	jobId: string
	itemId: string
	leaseToken: string
	ruleId: string | null
	previewResult: unknown
	materializationResult: unknown
	commercialImpact: unknown
}): Promise<boolean> {
	const updated = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationItem" AS item
			SET
				"status" = 'succeeded',
				"ruleId" = ${params.ruleId},
				"previewResultJson" = ${JSON.stringify(params.previewResult)}::jsonb,
				"materializationResultJson" = ${JSON.stringify(params.materializationResult)}::jsonb,
				"commercialImpactJson" = ${JSON.stringify(params.commercialImpact)}::jsonb,
				"errorCode" = NULL,
				"errorDetail" = NULL,
				"finishedAt" = CURRENT_TIMESTAMP,
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE item."id" = ${params.itemId}
				AND item."jobId" = ${params.jobId}
				AND EXISTS (
					SELECT 1 FROM "PricingBulkOperationJob" job
					WHERE job."id" = ${params.jobId}
						AND job."status" = 'running'
						AND job."lockedBy" = ${params.leaseToken}
				)
			RETURNING item."id"
		`)
	)
	return updated.length > 0
}

export async function markPricingBulkItemFailed(params: {
	jobId: string
	itemId: string
	leaseToken: string
	errorCode: string
	errorDetail: string
	retryAt: Date | null
}): Promise<boolean> {
	const updated = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationItem" AS item
			SET
				"status" = ${params.retryAt ? "queued" : "failed"},
				"errorCode" = ${params.errorCode},
				"errorDetail" = ${params.errorDetail.slice(0, 1000)},
				"finishedAt" = CASE WHEN ${params.retryAt != null} THEN NULL ELSE CURRENT_TIMESTAMP END,
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE item."id" = ${params.itemId}
				AND item."jobId" = ${params.jobId}
				AND EXISTS (
					SELECT 1 FROM "PricingBulkOperationJob" job
					WHERE job."id" = ${params.jobId}
						AND job."status" = 'running'
						AND job."lockedBy" = ${params.leaseToken}
				)
			RETURNING item."id"
		`)
	)
	return updated.length > 0
}

function terminalStatus(counts: JobCounts): "succeeded" | "partial" | "failed" {
	if (counts.failed === 0) return "succeeded"
	return counts.succeeded + counts.skipped + counts.cancelled > 0 ? "partial" : "failed"
}

export async function settlePricingBulkJobItems(params: {
	job: ClaimedPricingBulkJob
	leaseToken: string
	now: Date
	nextRunAt: Date | null
	retrying: boolean
}): Promise<{ readyForFinalization: boolean }> {
	let counts = await countsForJob(params.job.id)
	const nextAttempts = params.job.attempts + (params.retrying ? 1 : 0)
	const exhausted = nextAttempts >= params.job.maxAttempts
	if (counts.pending > 0 && exhausted) {
		await db.execute(sql`
			UPDATE "PricingBulkOperationItem"
			SET
				"status" = 'failed',
				"errorCode" = 'retry_budget_exhausted',
				"errorDetail" = 'Se agotó el máximo de intentos del trabajo.',
				"finishedAt" = CURRENT_TIMESTAMP
			WHERE "jobId" = ${params.job.id} AND "status" = 'queued'
		`)
		counts = await countsForJob(params.job.id)
	}
	const completed = counts.succeeded + counts.failed + counts.skipped + counts.cancelled
	const allItemsSettled = counts.pending === 0 && counts.running === 0
	if (allItemsSettled) {
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET
				"status" = 'finalizing',
				"attempts" = ${nextAttempts},
				"pendingItems" = ${counts.pending},
				"runningItems" = ${counts.running},
				"completedItems" = ${completed},
				"succeededItems" = ${counts.succeeded},
				"failedItems" = ${counts.failed},
				"skippedItems" = ${counts.skipped},
				"cancelledItems" = ${counts.cancelled},
				"finalizationStartedAt" = coalesce("finalizationStartedAt", ${params.now.toISOString()}),
				"finalizationErrorCode" = NULL,
				"finalizationErrorDetail" = NULL,
				"finishedAt" = NULL,
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.job.id}
				AND "status" = 'running'
				AND "lockedBy" = ${params.leaseToken}
		`)
		return { readyForFinalization: true }
	}
	const finalErrorCode = counts.failed > 0 ? "pricing_bulk_item_failed" : null
	const finalErrorDetail =
		counts.failed > 0 ? `${counts.failed} elemento(s) no pudieron aplicarse.` : null
	await db.execute(sql`
		UPDATE "PricingBulkOperationJob"
		SET
			"status" = 'queued',
			"attempts" = ${nextAttempts},
			"pendingItems" = ${counts.pending},
			"runningItems" = ${counts.running},
			"completedItems" = ${completed},
			"succeededItems" = ${counts.succeeded},
			"failedItems" = ${counts.failed},
			"skippedItems" = ${counts.skipped},
			"cancelledItems" = ${counts.cancelled},
			"lockedAt" = NULL,
			"lockedBy" = NULL,
			"runAfter" = ${params.nextRunAt?.toISOString() ?? params.now.toISOString()},
			"finalErrorCode" = ${finalErrorCode},
			"finalErrorDetail" = ${finalErrorDetail},
			"finishedAt" = NULL,
			"updatedAt" = CURRENT_TIMESTAMP
		WHERE "id" = ${params.job.id}
			AND "status" = 'running'
			AND "lockedBy" = ${params.leaseToken}
	`)
	return { readyForFinalization: false }
}

export async function listPricingBulkJobImpacts(params: {
	jobId: string
	leaseToken: string
}): Promise<unknown[]> {
	const result = rows<{ commercialImpactJson: unknown }>(
		await db.execute(sql`
			SELECT item."commercialImpactJson"
			FROM "PricingBulkOperationItem" AS item
			WHERE item."jobId" = ${params.jobId}
				AND item."status" = 'succeeded'
				AND item."commercialImpactJson" IS NOT NULL
				AND EXISTS (
					SELECT 1 FROM "PricingBulkOperationJob" job
					WHERE job."id" = ${params.jobId}
						AND job."status" = 'finalizing'
						AND job."lockedBy" = ${params.leaseToken}
				)
			ORDER BY item."createdAt" ASC
		`)
	)
	return result.map((row) => row.commercialImpactJson)
}

export async function completePricingBulkJobFinalization(params: {
	job: ClaimedPricingBulkJob
	leaseToken: string
	now: Date
}): Promise<boolean> {
	return db.transaction(async (tx) => {
		const counts = await countsForJob(params.job.id, tx)
		const completed = counts.succeeded + counts.failed + counts.skipped + counts.cancelled
		const status = terminalStatus(counts)
		const finalErrorCode = counts.failed > 0 ? "pricing_bulk_item_failed" : null
		const finalErrorDetail =
			counts.failed > 0 ? `${counts.failed} elemento(s) no pudieron aplicarse.` : null
		const finalizationResult = {
			status,
			completedItems: completed,
			succeededItems: counts.succeeded,
			failedItems: counts.failed,
			skippedItems: counts.skipped,
			cancelledItems: counts.cancelled,
			materializationCompleted: params.job.materializationCompletedAt != null,
			cacheInvalidationCompleted: params.job.cacheInvalidationCompletedAt != null,
			ariEnqueueCompleted: params.job.ariEnqueueCompletedAt != null,
		}
		const updated = rows<{ id: string }>(
			await tx.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET
				"status" = ${status},
				"pendingItems" = ${counts.pending},
				"runningItems" = ${counts.running},
				"completedItems" = ${completed},
				"succeededItems" = ${counts.succeeded},
				"failedItems" = ${counts.failed},
				"skippedItems" = ${counts.skipped},
				"cancelledItems" = ${counts.cancelled},
				"lockedAt" = NULL,
				"lockedBy" = NULL,
				"finalizationErrorCode" = NULL,
				"finalizationErrorDetail" = NULL,
				"finalizationFinishedAt" = ${params.now.toISOString()},
				"finalizationResultJson" = ${JSON.stringify(finalizationResult)}::jsonb,
				"requiresAttentionAt" = NULL,
				"finalErrorCode" = ${finalErrorCode},
				"finalErrorDetail" = ${finalErrorDetail},
				"finishedAt" = ${params.now.toISOString()},
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.job.id}
				AND "status" = 'finalizing'
				AND "lockedBy" = ${params.leaseToken}
			RETURNING "id"
		`)
		)
		if (!updated.length) return false
		await tx.execute(sql`
			INSERT INTO "ProviderAuditLog" (
				"id", "providerId", "actorUserId", "action", "entityType", "entityId",
				"beforeJson", "afterJson", "riskLevel", "createdAt"
			) VALUES (
				${randomUUID()}, ${params.job.providerId}, ${params.job.requestedByUserId},
				'pricing.bulk_job.completed', 'pricing_bulk_job', ${params.job.id},
				${JSON.stringify({ status: "finalizing" })}::jsonb,
				${JSON.stringify(finalizationResult)}::jsonb,
				${counts.failed > 0 ? "medium" : "low"}, ${params.now.toISOString()}
			)
		`)
		return true
	})
}

export async function deferPricingBulkJobFinalization(params: {
	job: ClaimedPricingBulkJob
	leaseToken: string
	now: Date
	errorCode: string
	errorDetail: string
}): Promise<boolean> {
	const nextAttempts = Math.min(
		params.job.finalizationAttempts + 1,
		params.job.finalizationMaxAttempts
	)
	const exhausted = nextAttempts >= params.job.finalizationMaxAttempts
	const retryAt = new Date(
		params.now.getTime() + pricingBulkRetryDelayMs(Math.max(1, nextAttempts))
	)
	const updated = rows<{ id: string }>(
		await db.execute(sql`
			UPDATE "PricingBulkOperationJob"
			SET
				"status" = ${exhausted ? "requires_attention" : "finalizing"},
				"lockedAt" = NULL,
				"lockedBy" = NULL,
				"runAfter" = ${exhausted ? params.now.toISOString() : retryAt.toISOString()},
				"finalizationAttempts" = ${nextAttempts},
				"finalizationErrorCode" = ${params.errorCode},
				"finalizationErrorDetail" = ${params.errorDetail.slice(0, 1000)},
				"finalErrorCode" = ${exhausted ? "pricing_bulk_finalization_requires_attention" : "pricing_bulk_finalization_retry_pending"},
				"finalErrorDetail" = ${exhausted ? "La finalización agotó sus reintentos y requiere revisión." : "La finalización comercial se reintentará de forma segura."},
				"requiresAttentionAt" = ${exhausted ? params.now.toISOString() : null},
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = ${params.job.id}
				AND "status" = 'finalizing'
				AND "lockedBy" = ${params.leaseToken}
			RETURNING "id"
		`)
	)
	if (updated.length > 0 && exhausted) {
		await db.execute(sql`
			INSERT INTO "ProviderAuditLog" (
				"id", "providerId", "actorUserId", "action", "entityType", "entityId",
				"beforeJson", "afterJson", "riskLevel", "createdAt"
			) VALUES (
				${randomUUID()}, ${params.job.providerId}, ${params.job.requestedByUserId},
				'pricing.bulk_job.requires_attention', 'pricing_bulk_job', ${params.job.id},
				${JSON.stringify({ status: "finalizing", attempts: params.job.finalizationAttempts })}::jsonb,
				${JSON.stringify({ status: "requires_attention", errorCode: params.errorCode, attempts: nextAttempts })}::jsonb,
				'high', ${params.now.toISOString()}
			)
		`)
	}
	return updated.length > 0
}
