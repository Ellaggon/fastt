import { logger } from "@/lib/observability/logger"
import { incrementCounter, observeTiming, setGauge } from "@/lib/observability/metrics"
import {
	getRatePlanOwnerContext,
	PricingRuleCommandError,
	type NormalizedPricingRuleCommand,
	type PricingRuleImpactDescriptor,
	type PricingRuleContext,
} from "@/modules/pricing/public"

import {
	claimPricingBulkJobItems,
	claimQueuedPricingBulkJobs,
	checkpointPricingBulkEffect,
	checkpointPricingBulkMaterialization,
	completePricingBulkJobFinalization,
	deferPricingBulkJobFinalization,
	listPricingBulkJobImpacts,
	markPricingBulkItemFailed,
	markPricingBulkItemSucceeded,
	pricingBulkJobLeaseToken,
	pricingBulkRetryDelayMs,
	refreshPricingBulkJobLease,
	releasePricingBulkJobLease,
	recoverExpiredPricingBulkJobLeases,
	getPricingBulkQueueSnapshot,
	settlePricingBulkJobItems,
	type ClaimedPricingBulkItem,
} from "./pricing-bulk-job-queue"

const DEFAULT_LEASE_MS = 5 * 60_000
const DEFAULT_TIME_BUDGET_MS = 45_000
const FINALIZATION_RESERVE_MS = 8_000

class PricingBulkWorkerBudgetError extends Error {
	readonly code = "pricing_bulk_worker_time_budget_exhausted"
}

export type PricingBulkWorkerConfiguration = {
	jobBatchSize: number
	itemBatchSize: number
	itemConcurrency: number
	leaseMs: number
	timeBudgetMs: number
}

export type PricingBulkWorkerResult = {
	leaseToken: string
	recoveredJobs: number
	claimedJobs: number
	processedItems: number
	succeededItems: number
	failedItems: number
	deferredItems: number
	finalizedJobs: number
	finalizationFailures: number
	releasedJobs: number
	durationMs: number
	timeBudgetExceeded: boolean
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

export function pricingBulkWorkerConfiguration(
	env: NodeJS.ProcessEnv = process.env
): PricingBulkWorkerConfiguration {
	return {
		jobBatchSize: boundedInteger(env.PRICING_BULK_WORKER_JOB_BATCH_SIZE, 4, 1, 20),
		itemBatchSize: boundedInteger(env.PRICING_BULK_WORKER_ITEM_BATCH_SIZE, 8, 1, 20),
		itemConcurrency: boundedInteger(env.PRICING_BULK_WORKER_ITEM_CONCURRENCY, 3, 2, 4),
		leaseMs: boundedInteger(
			env.PRICING_BULK_WORKER_LEASE_MS,
			DEFAULT_LEASE_MS,
			30_000,
			30 * 60_000
		),
		timeBudgetMs: boundedInteger(
			env.PRICING_BULK_WORKER_TIME_BUDGET_MS,
			DEFAULT_TIME_BUDGET_MS,
			10_000,
			50_000
		),
	}
}

function publishQueueSnapshot(snapshot: Awaited<ReturnType<typeof getPricingBulkQueueSnapshot>>) {
	for (const [state, value] of Object.entries(snapshot.jobs)) {
		setGauge("pricing_bulk_worker_observed_job_queue_depth", value, { state })
	}
	for (const [state, value] of Object.entries(snapshot.items)) {
		setGauge("pricing_bulk_worker_observed_item_queue_depth", value, { state })
	}
}

function isNormalizedCommand(value: unknown): value is NormalizedPricingRuleCommand {
	if (!value || typeof value !== "object") return false
	const candidate = value as Record<string, unknown>
	return typeof candidate.type === "string" && Number.isFinite(Number(candidate.value))
}

function impactFromStoredResult(value: unknown): PricingRuleImpactDescriptor | null {
	let normalized = value
	if (typeof normalized === "string") {
		try {
			normalized = JSON.parse(normalized)
		} catch {
			return null
		}
	}
	const record =
		normalized && typeof normalized === "object" ? (normalized as Record<string, unknown>) : null
	const impact = record?.impact
	if (!impact || typeof impact !== "object") return null
	const candidate = impact as Record<string, unknown>
	const ratePlanId = String(candidate.ratePlanId ?? "").trim()
	const variantId = String(candidate.variantId ?? "").trim()
	const from = String(candidate.from ?? "").trim()
	const toExclusive = String(candidate.toExclusive ?? "").trim()
	if (
		!ratePlanId ||
		!variantId ||
		!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
		!/^\d{4}-\d{2}-\d{2}$/.test(toExclusive)
	) {
		return null
	}
	return {
		ratePlanId,
		variantId,
		from,
		toExclusive,
		occupancyKey: candidate.occupancyKey == null ? null : String(candidate.occupancyKey),
	}
}

function readableError(error: unknown): {
	code: string
	detail: string
	retryable: boolean
} {
	if (error instanceof PricingBulkWorkerBudgetError) {
		return {
			code: error.code,
			detail: "La ejecución continuará en el siguiente ciclo.",
			retryable: true,
		}
	}
	if (error instanceof PricingRuleCommandError) {
		return {
			code: error.code,
			detail: `No se pudo aplicar la regla: ${error.code}.`,
			retryable: error.status >= 500 || error.status === 429,
		}
	}
	const message = error instanceof Error ? error.message : String(error)
	return {
		code: "pricing_bulk_item_execution_failed",
		detail: message.slice(0, 1000) || "No se pudo aplicar la regla por un error inesperado.",
		retryable: true,
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	callback: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length)
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (true) {
				const index = cursor++
				if (index >= items.length) return
				results[index] = await callback(items[index])
			}
		})
	)
	return results
}

async function processItem(params: {
	job: {
		id: string
		providerId: string
		commandJson: unknown
		operationType: "create_pricing_rule" | "preview_pricing_rule"
		attempts: number
		maxAttempts: number
	}
	item: ClaimedPricingBulkItem
	leaseToken: string
	now: Date
}): Promise<"succeeded" | "failed" | "deferred"> {
	if (!isNormalizedCommand(params.job.commandJson)) {
		await markPricingBulkItemFailed({
			jobId: params.job.id,
			itemId: params.item.id,
			leaseToken: params.leaseToken,
			errorCode: "pricing_bulk_command_invalid",
			errorDetail: "El comando persistido no tiene una forma válida para ejecutarse.",
			retryAt: null,
		})
		return "failed"
	}

	const { ratePlanOwnerContextRepository, pricingRuleCommandService } = await import("@/container")
	const owner = await getRatePlanOwnerContext(
		{ repo: ratePlanOwnerContextRepository },
		{ ratePlanId: params.item.ratePlanId }
	)
	if (
		!owner ||
		owner.providerId !== params.job.providerId ||
		owner.productId !== params.item.productIdSnapshot ||
		owner.variantId !== params.item.variantIdSnapshot
	) {
		await markPricingBulkItemFailed({
			jobId: params.job.id,
			itemId: params.item.id,
			leaseToken: params.leaseToken,
			errorCode: "rate_plan_ownership_changed",
			errorDetail:
				"La tarifa ya no pertenece al producto, unidad o proveedor que tenía cuando se creó el trabajo.",
			retryAt: null,
		})
		return "failed"
	}

	const context: PricingRuleContext = { ...owner, providerId: params.job.providerId }
	const command = {
		...params.job.commandJson,
		idempotencyKey: `pricing-bulk:${params.job.id}:${params.item.ratePlanId}`,
	}
	try {
		const preview = await pricingRuleCommandService.previewCandidate(context, command)
		if (params.job.operationType === "preview_pricing_rule") {
			await markPricingBulkItemSucceeded({
				jobId: params.job.id,
				itemId: params.item.id,
				leaseToken: params.leaseToken,
				ruleId: null,
				previewResult: preview,
				materializationResult: null,
				commercialImpact: null,
			})
			return "succeeded"
		}
		if (params.job.operationType !== "create_pricing_rule") {
			await markPricingBulkItemFailed({
				jobId: params.job.id,
				itemId: params.item.id,
				leaseToken: params.leaseToken,
				errorCode: "pricing_bulk_operation_unsupported",
				errorDetail: "El tipo de operación persistido no está soportado por este worker.",
				retryAt: null,
			})
			return "failed"
		}
		const result = await pricingRuleCommandService.createRule(context, command, {
			executionMode: "deferred",
		})
		await markPricingBulkItemSucceeded({
			jobId: params.job.id,
			itemId: params.item.id,
			leaseToken: params.leaseToken,
			ruleId: result.ruleId,
			previewResult: preview,
			materializationResult: null,
			commercialImpact: {
				impact: result.impact,
				replayed: result.replayed,
				resultingRuleCount: result.rules.length,
			},
		})
		return "succeeded"
	} catch (error) {
		const failure = readableError(error)
		const retryAt =
			failure.retryable &&
			params.item.attempts < params.job.maxAttempts &&
			params.job.attempts + 1 < params.job.maxAttempts
				? new Date(params.now.getTime() + pricingBulkRetryDelayMs(params.item.attempts))
				: null
		await markPricingBulkItemFailed({
			jobId: params.job.id,
			itemId: params.item.id,
			leaseToken: params.leaseToken,
			errorCode: failure.code,
			errorDetail: failure.detail,
			retryAt,
		})
		return retryAt ? "deferred" : "failed"
	}
}

export async function runPricingBulkJobWorker(options?: {
	now?: Date
	jobBatchSize?: number
	itemBatchSize?: number
	itemConcurrency?: number
	leaseMs?: number
	timeBudgetMs?: number
}): Promise<PricingBulkWorkerResult> {
	const startedAtMs = Date.now()
	const now = options?.now ?? new Date()
	const configuration = pricingBulkWorkerConfiguration()
	const leaseToken = pricingBulkJobLeaseToken()
	const jobBatchSize = boundedInteger(options?.jobBatchSize, configuration.jobBatchSize, 1, 20)
	const itemBatchSize = boundedInteger(options?.itemBatchSize, configuration.itemBatchSize, 1, 20)
	const itemConcurrency = boundedInteger(
		options?.itemConcurrency,
		configuration.itemConcurrency,
		2,
		4
	)
	const leaseMs = boundedInteger(options?.leaseMs, configuration.leaseMs, 30_000, 30 * 60_000)
	const timeBudgetMs = boundedInteger(
		options?.timeBudgetMs,
		configuration.timeBudgetMs,
		10_000,
		50_000
	)
	const deadlineMs = startedAtMs + timeBudgetMs
	const recoveredJobs = await recoverExpiredPricingBulkJobLeases({ now, leaseMs })
	const queueBefore = await getPricingBulkQueueSnapshot(now)
	publishQueueSnapshot(queueBefore)
	const jobs = await claimQueuedPricingBulkJobs({ now, batchSize: jobBatchSize, leaseToken })
	const result: PricingBulkWorkerResult = {
		leaseToken,
		recoveredJobs,
		claimedJobs: jobs.length,
		processedItems: 0,
		succeededItems: 0,
		failedItems: 0,
		deferredItems: 0,
		finalizedJobs: 0,
		finalizationFailures: 0,
		releasedJobs: 0,
		durationMs: 0,
		timeBudgetExceeded: false,
	}
	for (const job of jobs) {
		observeTiming(
			"pricing_bulk_job_queue_latency_ms",
			Math.max(0, now.getTime() - new Date(job.createdAt).getTime()),
			{ status: job.status }
		)
	}
	incrementCounter("pricing_bulk_worker_runs_total", { trigger: "scheduled" })
	if (recoveredJobs > 0) {
		incrementCounter("pricing_bulk_job_leases_recovered_total", undefined, recoveredJobs)
	}

	jobLoop: for (const [index, job] of jobs.entries()) {
		if (Date.now() >= deadlineMs) {
			result.timeBudgetExceeded = true
			for (const claimedButUnstarted of jobs.slice(index)) {
				if (
					await releasePricingBulkJobLease({
						jobId: String(claimedButUnstarted.id),
						leaseToken,
						now: new Date(),
					})
				) {
					result.releasedJobs += 1
				}
			}
			break
		}
		let nextRunAt: Date | null = null
		const leaseIsCurrent = await refreshPricingBulkJobLease({
			jobId: String(job.id),
			leaseToken,
			now,
		})
		if (!leaseIsCurrent) {
			logger.warn("pricing_bulk_job_lease_lost_before_processing", { jobId: job.id })
			continue
		}
		let readyForFinalization = job.status === "finalizing"
		if (job.status === "running") {
			const items = await claimPricingBulkJobItems({
				jobId: String(job.id),
				leaseToken,
				batchSize: itemBatchSize,
			})
			const outcomes = await mapWithConcurrency(items, itemConcurrency, (item) =>
				processItem({ job, item, leaseToken, now })
			)
			result.processedItems += outcomes.length
			result.succeededItems += outcomes.filter((outcome) => outcome === "succeeded").length
			result.failedItems += outcomes.filter((outcome) => outcome === "failed").length
			const deferred = outcomes.filter((outcome) => outcome === "deferred").length
			result.deferredItems += deferred
			if (deferred) {
				nextRunAt = new Date(now.getTime() + pricingBulkRetryDelayMs(job.attempts + 1))
			}
			const settled = await settlePricingBulkJobItems({
				job,
				leaseToken,
				now,
				nextRunAt,
				retrying: deferred > 0,
			})
			readyForFinalization = settled.readyForFinalization
		}
		if (!readyForFinalization) continue
		if (Date.now() >= deadlineMs - FINALIZATION_RESERVE_MS) {
			result.timeBudgetExceeded = true
			for (const claimed of jobs.slice(index)) {
				if (
					await releasePricingBulkJobLease({
						jobId: String(claimed.id),
						leaseToken,
						now: new Date(),
					})
				) {
					result.releasedJobs += 1
				}
			}
			break jobLoop
		}
		const leaseStillCurrent = await refreshPricingBulkJobLease({
			jobId: String(job.id),
			leaseToken,
			now: new Date(),
		})
		if (!leaseStillCurrent) {
			logger.warn("pricing_bulk_job_lease_lost_after_processing", { jobId: job.id })
			continue
		}
		try {
			const persistedImpacts = await listPricingBulkJobImpacts({
				jobId: String(job.id),
				leaseToken,
			})
			const impacts = persistedImpacts
				.map(impactFromStoredResult)
				.filter((impact): impact is PricingRuleImpactDescriptor => impact !== null)
			if (job.operationType === "create_pricing_rule" && impacts.length > 0) {
				const { pricingRuleCommandService } = await import("@/container")
				await pricingRuleCommandService.finalizeDeferredImpacts({
					impacts,
					idempotencyScope: `pricing-bulk:${job.id}:effects`,
					checkpoint: {
						materializationCompleted: job.materializationCompletedAt != null,
						cacheInvalidationCompleted: job.cacheInvalidationCompletedAt != null,
						ariEnqueueCompleted: job.ariEnqueueCompletedAt != null,
						assertCanContinue: () => {
							if (Date.now() >= deadlineMs - 1_500) throw new PricingBulkWorkerBudgetError()
						},
						onMaterializationCompleted: async (materializations) => {
							if (
								!(await checkpointPricingBulkMaterialization({
									jobId: String(job.id),
									leaseToken,
									results: materializations,
									now: new Date(),
								}))
							) {
								throw new Error("pricing_bulk_job_lease_lost_during_materialization_checkpoint")
							}
							job.materializationCompletedAt = new Date()
						},
						onCacheInvalidationCompleted: async () => {
							if (
								!(await checkpointPricingBulkEffect({
									jobId: String(job.id),
									leaseToken,
									stage: "cache_invalidation",
									now: new Date(),
								}))
							) {
								throw new Error("pricing_bulk_job_lease_lost_during_cache_checkpoint")
							}
							job.cacheInvalidationCompletedAt = new Date()
						},
						onAriEnqueueCompleted: async () => {
							if (
								!(await checkpointPricingBulkEffect({
									jobId: String(job.id),
									leaseToken,
									stage: "ari_enqueue",
									now: new Date(),
								}))
							) {
								throw new Error("pricing_bulk_job_lease_lost_during_ari_checkpoint")
							}
							job.ariEnqueueCompletedAt = new Date()
						},
					},
				})
			}
			if (await completePricingBulkJobFinalization({ job, leaseToken, now: new Date() })) {
				result.finalizedJobs += 1
			}
		} catch (error) {
			if (error instanceof PricingBulkWorkerBudgetError) {
				result.timeBudgetExceeded = true
				if (
					await releasePricingBulkJobLease({
						jobId: String(job.id),
						leaseToken,
						now: new Date(),
					})
				) {
					result.releasedJobs += 1
				}
				for (const claimedButUnstarted of jobs.slice(index + 1)) {
					if (
						await releasePricingBulkJobLease({
							jobId: String(claimedButUnstarted.id),
							leaseToken,
							now: new Date(),
						})
					) {
						result.releasedJobs += 1
					}
				}
				break jobLoop
			}
			const failure = readableError(error)
			if (
				await deferPricingBulkJobFinalization({
					job,
					leaseToken,
					now: new Date(),
					errorCode: failure.code,
					errorDetail: failure.detail,
				})
			) {
				result.finalizationFailures += 1
			}
		}
	}
	result.durationMs = Math.max(0, Date.now() - startedAtMs)
	const queueAfter = await getPricingBulkQueueSnapshot(new Date())
	publishQueueSnapshot(queueAfter)
	observeTiming("pricing_bulk_worker_duration_ms", result.durationMs, {
		budget_exceeded: result.timeBudgetExceeded,
	})
	if (result.claimedJobs > 0) {
		incrementCounter("pricing_bulk_jobs_claimed_total", undefined, result.claimedJobs)
	}
	if (result.succeededItems > 0) {
		incrementCounter(
			"pricing_bulk_items_processed_total",
			{ outcome: "succeeded" },
			result.succeededItems
		)
	}
	if (result.failedItems > 0) {
		incrementCounter(
			"pricing_bulk_items_processed_total",
			{ outcome: "failed" },
			result.failedItems
		)
	}
	if (result.deferredItems > 0) {
		incrementCounter("pricing_bulk_item_retries_scheduled_total", undefined, result.deferredItems)
	}
	if (result.finalizationFailures > 0) {
		incrementCounter(
			"pricing_bulk_finalization_retries_scheduled_total",
			undefined,
			result.finalizationFailures
		)
	}
	logger.info("pricing_bulk_job_worker_completed", result)
	return result
}
