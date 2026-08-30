import { createHash, randomUUID } from "node:crypto"

import {
	and,
	db,
	eq,
	first,
	inArray,
	isNull,
	PricingBulkOperationItem,
	PricingBulkOperationJob,
	Product,
	ProviderAuditLog,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

import type {
	PricingBulkJobItemRecord,
	PricingBulkJobRecord,
	PricingBulkJobRepositoryPort,
	PricingBulkJobTarget,
	PricingBulkOperationType,
} from "../../application/ports/PricingBulkJobRepositoryPort"
import { PricingBulkJobError } from "../../application/use-cases/pricing-bulk-job-service"

function asDate(value: unknown): Date {
	return value instanceof Date ? value : new Date(String(value))
}

function asNullableDate(value: unknown): Date | null {
	return value == null ? null : asDate(value)
}

function asJob(row: typeof PricingBulkOperationJob.$inferSelect): PricingBulkJobRecord {
	return {
		id: String(row.id),
		providerId: String(row.providerId),
		requestedByUserId: String(row.requestedByUserId),
		idempotencyKey: String(row.idempotencyKey),
		payloadHash: String(row.payloadHash),
		operationType: row.operationType as PricingBulkOperationType,
		command: row.commandJson as PricingBulkJobRecord["command"],
		status: row.status as PricingBulkJobRecord["status"],
		totalItems: Number(row.totalItems),
		pendingItems: Number(row.pendingItems),
		runningItems: Number(row.runningItems),
		completedItems: Number(row.completedItems),
		succeededItems: Number(row.succeededItems),
		failedItems: Number(row.failedItems),
		skippedItems: Number(row.skippedItems),
		cancelledItems: Number(row.cancelledItems),
		attempts: Number(row.attempts),
		maxAttempts: Number(row.maxAttempts),
		finalizationAttempts: Number(row.finalizationAttempts),
		finalizationMaxAttempts: Number(row.finalizationMaxAttempts),
		materializationCompletedAt: asNullableDate(row.materializationCompletedAt),
		cacheInvalidationCompletedAt: asNullableDate(row.cacheInvalidationCompletedAt),
		ariEnqueueCompletedAt: asNullableDate(row.ariEnqueueCompletedAt),
		finalizationResult: row.finalizationResultJson,
		requiresAttentionAt: asNullableDate(row.requiresAttentionAt),
		runAfter: asDate(row.runAfter),
		createdAt: asDate(row.createdAt),
		updatedAt: asDate(row.updatedAt),
		startedAt: asNullableDate(row.startedAt),
		finishedAt: asNullableDate(row.finishedAt),
		finalErrorCode: row.finalErrorCode == null ? null : String(row.finalErrorCode),
		finalErrorDetail: row.finalErrorDetail == null ? null : String(row.finalErrorDetail),
		finalizationErrorCode:
			row.finalizationErrorCode == null ? null : String(row.finalizationErrorCode),
		finalizationErrorDetail:
			row.finalizationErrorDetail == null ? null : String(row.finalizationErrorDetail),
		finalizationStartedAt: asNullableDate(row.finalizationStartedAt),
		finalizationFinishedAt: asNullableDate(row.finalizationFinishedAt),
	}
}

function asItem(row: typeof PricingBulkOperationItem.$inferSelect): PricingBulkJobItemRecord {
	return {
		id: String(row.id),
		ratePlanId: String(row.ratePlanId),
		productIdSnapshot: String(row.productIdSnapshot),
		productNameSnapshot: row.productNameSnapshot == null ? null : String(row.productNameSnapshot),
		variantIdSnapshot: String(row.variantIdSnapshot),
		variantNameSnapshot: row.variantNameSnapshot == null ? null : String(row.variantNameSnapshot),
		status: row.status as PricingBulkJobItemRecord["status"],
		attempts: Number(row.attempts),
		ruleId: row.ruleId == null ? null : String(row.ruleId),
		previewResult: row.previewResultJson,
		materializationResult: row.materializationResultJson,
		errorCode: row.errorCode == null ? null : String(row.errorCode),
		errorDetail: row.errorDetail == null ? null : String(row.errorDetail),
		commercialImpact: row.commercialImpactJson,
		startedAt: asNullableDate(row.startedAt),
		finishedAt: asNullableDate(row.finishedAt),
	}
}

function auditFingerprint(payloadHash: string) {
	return createHash("sha256").update(payloadHash).digest("hex")
}

async function resolveOwnedTargets(
	tx: Pick<typeof db, "select">,
	providerId: string,
	ratePlanIds: string[]
): Promise<PricingBulkJobTarget[]> {
	const rows = await tx
		.select({
			ratePlanId: RatePlan.id,
			productId: Product.id,
			productName: Product.name,
			variantId: Variant.id,
			variantName: Variant.name,
			providerId: Product.providerId,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(inArray(RatePlan.id, ratePlanIds))

	if (rows.length !== ratePlanIds.length || rows.some((row) => row.providerId !== providerId)) {
		throw new PricingBulkJobError("bulk_rate_plan_ownership_invalid", 400)
	}

	return rows.map((row) => ({
		ratePlanId: String(row.ratePlanId),
		productId: String(row.productId),
		productName: row.productName == null ? null : String(row.productName),
		variantId: String(row.variantId),
		variantName: row.variantName == null ? null : String(row.variantName),
	}))
}

export class PricingBulkJobRepository implements PricingBulkJobRepositoryPort {
	async enqueue(input: {
		providerId: string
		requestedByUserId: string
		idempotencyKey: string
		payloadHash: string
		operationType: PricingBulkOperationType
		command: PricingBulkJobRecord["command"]
		ratePlanIds: string[]
		maxAttempts: number
	}): Promise<{ job: PricingBulkJobRecord; replayed: boolean }> {
		return db.transaction(async (tx) => {
			const existing = await tx
				.select()
				.from(PricingBulkOperationJob)
				.where(
					and(
						eq(PricingBulkOperationJob.providerId, input.providerId),
						eq(PricingBulkOperationJob.idempotencyKey, input.idempotencyKey)
					)
				)
				.then(first)
			if (existing) {
				if (String(existing.payloadHash) !== input.payloadHash) {
					throw new PricingBulkJobError("bulk_job_idempotency_conflict", 409)
				}
				return { job: asJob(existing), replayed: true }
			}
			const targets = await resolveOwnedTargets(tx, input.providerId, input.ratePlanIds)
			const id = randomUUID()
			const created = await tx
				.insert(PricingBulkOperationJob)
				.values({
					id,
					providerId: input.providerId,
					requestedByUserId: input.requestedByUserId,
					idempotencyKey: input.idempotencyKey,
					payloadHash: input.payloadHash,
					operationType: input.operationType,
					commandJson: input.command,
					status: "queued",
					totalItems: targets.length,
					pendingItems: targets.length,
					maxAttempts: input.maxAttempts,
					runAfter: new Date(),
				})
				.onConflictDoNothing()
				.returning()

			if (!created.length) {
				const concurrent = await tx
					.select()
					.from(PricingBulkOperationJob)
					.where(
						and(
							eq(PricingBulkOperationJob.providerId, input.providerId),
							eq(PricingBulkOperationJob.idempotencyKey, input.idempotencyKey)
						)
					)
					.then(first)
				if (!concurrent) throw new PricingBulkJobError("bulk_job_enqueue_race", 409)
				if (String(concurrent.payloadHash) !== input.payloadHash) {
					throw new PricingBulkJobError("bulk_job_idempotency_conflict", 409)
				}
				return { job: asJob(concurrent), replayed: true }
			}

			await tx.insert(PricingBulkOperationItem).values(
				targets.map((target) => ({
					id: randomUUID(),
					jobId: id,
					ratePlanId: target.ratePlanId,
					productIdSnapshot: target.productId,
					productNameSnapshot: target.productName,
					variantIdSnapshot: target.variantId,
					variantNameSnapshot: target.variantName,
					status: "queued",
				}))
			)
			await tx.insert(ProviderAuditLog).values({
				id: randomUUID(),
				providerId: input.providerId,
				actorUserId: input.requestedByUserId,
				action:
					input.operationType === "preview_pricing_rule"
						? "pricing.bulk_preview.enqueued"
						: "pricing.bulk_job.enqueued",
				entityType: "pricing_bulk_job",
				entityId: id,
				beforeJson: null,
				afterJson: {
					operationType: input.operationType,
					itemCount: targets.length,
					payloadHash: auditFingerprint(input.payloadHash),
				},
				riskLevel: input.operationType === "preview_pricing_rule" ? "low" : "medium",
			})
			return { job: asJob(created[0]), replayed: false }
		})
	}

	async get(providerId: string, jobId: string) {
		const job = await db
			.select()
			.from(PricingBulkOperationJob)
			.where(
				and(
					eq(PricingBulkOperationJob.id, jobId),
					eq(PricingBulkOperationJob.providerId, providerId)
				)
			)
			.then(first)
		if (!job) return null
		const items = await db
			.select()
			.from(PricingBulkOperationItem)
			.where(eq(PricingBulkOperationItem.jobId, jobId))
			.orderBy(PricingBulkOperationItem.createdAt)
		return { job: asJob(job), items: items.map(asItem) }
	}

	async retryFailed(input: { providerId: string; requestedByUserId: string; jobId: string }) {
		return db.transaction(async (tx) => {
			const job = await tx
				.select()
				.from(PricingBulkOperationJob)
				.where(
					and(
						eq(PricingBulkOperationJob.id, input.jobId),
						eq(PricingBulkOperationJob.providerId, input.providerId)
					)
				)
				.then(first)
			if (!job) throw new PricingBulkJobError("bulk_job_not_found", 404)
			if (job.status === "requires_attention") {
				const [updated] = await tx
					.update(PricingBulkOperationJob)
					.set({
						status: "finalizing",
						finalizationAttempts: 0,
						runAfter: new Date(),
						lockedAt: null,
						lockedBy: null,
						requiresAttentionAt: null,
						finalErrorCode: null,
						finalErrorDetail: null,
						finalizationErrorCode: null,
						finalizationErrorDetail: null,
						finishedAt: null,
					})
					.where(eq(PricingBulkOperationJob.id, input.jobId))
					.returning()
				await tx.insert(ProviderAuditLog).values({
					id: randomUUID(),
					providerId: input.providerId,
					actorUserId: input.requestedByUserId,
					action: "pricing.bulk_job.finalization_retry_requested",
					entityType: "pricing_bulk_job",
					entityId: input.jobId,
					beforeJson: { status: job.status, attempts: Number(job.finalizationAttempts) },
					afterJson: { status: "finalizing", attempts: 0 },
					riskLevel: "medium",
				})
				return asJob(updated)
			}
			if (job.status !== "failed" && job.status !== "partial") {
				throw new PricingBulkJobError("bulk_job_not_retryable", 409)
			}
			const failedItems = await tx
				.select({ id: PricingBulkOperationItem.id })
				.from(PricingBulkOperationItem)
				.where(
					and(
						eq(PricingBulkOperationItem.jobId, input.jobId),
						eq(PricingBulkOperationItem.status, "failed")
					)
				)
			if (!failedItems.length) throw new PricingBulkJobError("bulk_job_no_failed_items", 409)

			await tx
				.update(PricingBulkOperationItem)
				.set({ status: "queued", startedAt: null, finishedAt: null })
				.where(
					inArray(
						PricingBulkOperationItem.id,
						failedItems.map((item) => item.id)
					)
				)
			const completedItems =
				Number(job.succeededItems) + Number(job.skippedItems) + Number(job.cancelledItems)
			const [updated] = await tx
				.update(PricingBulkOperationJob)
				.set({
					status: "queued",
					attempts: 0,
					pendingItems: failedItems.length,
					runningItems: 0,
					completedItems,
					failedItems: 0,
					runAfter: new Date(),
					lockedAt: null,
					lockedBy: null,
					finalErrorCode: null,
					finalErrorDetail: null,
					finishedAt: null,
				})
				.where(eq(PricingBulkOperationJob.id, input.jobId))
				.returning()
			await tx.insert(ProviderAuditLog).values({
				id: randomUUID(),
				providerId: input.providerId,
				actorUserId: input.requestedByUserId,
				action: "pricing.bulk_job.retry_requested",
				entityType: "pricing_bulk_job",
				entityId: input.jobId,
				beforeJson: { failedItems: Number(job.failedItems), status: job.status },
				afterJson: { requeuedItems: failedItems.length, status: "queued" },
				riskLevel: "medium",
			})
			return asJob(updated)
		})
	}

	async cancelQueued(input: { providerId: string; requestedByUserId: string; jobId: string }) {
		return db.transaction(async (tx) => {
			const job = await tx
				.select()
				.from(PricingBulkOperationJob)
				.where(
					and(
						eq(PricingBulkOperationJob.id, input.jobId),
						eq(PricingBulkOperationJob.providerId, input.providerId)
					)
				)
				.then(first)
			if (!job) throw new PricingBulkJobError("bulk_job_not_found", 404)
			if (job.status !== "queued" || Number(job.attempts) !== 0 || job.startedAt != null) {
				throw new PricingBulkJobError("bulk_job_already_started", 409)
			}
			const queuedItems = await tx
				.select({ id: PricingBulkOperationItem.id })
				.from(PricingBulkOperationItem)
				.where(
					and(
						eq(PricingBulkOperationItem.jobId, input.jobId),
						eq(PricingBulkOperationItem.status, "queued")
					)
				)
			if (queuedItems.length !== Number(job.totalItems)) {
				throw new PricingBulkJobError("bulk_job_already_started", 409)
			}
			const [updated] = await tx
				.update(PricingBulkOperationJob)
				.set({
					status: "cancelled",
					pendingItems: 0,
					runningItems: 0,
					completedItems: Number(job.totalItems),
					cancelledItems: Number(job.totalItems),
					finishedAt: new Date(),
				})
				.where(
					and(
						eq(PricingBulkOperationJob.id, input.jobId),
						eq(PricingBulkOperationJob.status, "queued"),
						eq(PricingBulkOperationJob.attempts, 0),
						isNull(PricingBulkOperationJob.startedAt)
					)
				)
				.returning()
			if (!updated) throw new PricingBulkJobError("bulk_job_already_started", 409)
			await tx
				.update(PricingBulkOperationItem)
				.set({ status: "cancelled", finishedAt: new Date() })
				.where(
					inArray(
						PricingBulkOperationItem.id,
						queuedItems.map((item) => item.id)
					)
				)
			await tx.insert(ProviderAuditLog).values({
				id: randomUUID(),
				providerId: input.providerId,
				actorUserId: input.requestedByUserId,
				action: "pricing.bulk_job.cancelled",
				entityType: "pricing_bulk_job",
				entityId: input.jobId,
				beforeJson: { status: job.status, pendingItems: Number(job.pendingItems) },
				afterJson: { status: "cancelled", cancelledItems: Number(job.totalItems) },
				riskLevel: "medium",
			})
			return asJob(updated)
		})
	}
}
