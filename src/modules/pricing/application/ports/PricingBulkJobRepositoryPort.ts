import type { NormalizedPricingRuleCommand } from "../use-cases/pricing-rule-command-service"

export type PricingBulkJobStatus =
	| "queued"
	| "running"
	| "finalizing"
	| "succeeded"
	| "partial"
	| "failed"
	| "requires_attention"
	| "cancelled"

export type PricingBulkOperationType = "create_pricing_rule" | "preview_pricing_rule"

export type PricingBulkJobItemStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "skipped"
	| "cancelled"

export type PricingBulkJobTarget = {
	ratePlanId: string
	productId: string
	productName: string | null
	variantId: string
	variantName: string | null
}

export type PricingBulkJobRecord = {
	id: string
	providerId: string
	requestedByUserId: string
	idempotencyKey: string
	payloadHash: string
	operationType: PricingBulkOperationType
	command: NormalizedPricingRuleCommand
	status: PricingBulkJobStatus
	totalItems: number
	pendingItems: number
	runningItems: number
	completedItems: number
	succeededItems: number
	failedItems: number
	skippedItems: number
	cancelledItems: number
	attempts: number
	maxAttempts: number
	finalizationAttempts: number
	finalizationMaxAttempts: number
	materializationCompletedAt: Date | null
	cacheInvalidationCompletedAt: Date | null
	ariEnqueueCompletedAt: Date | null
	finalizationResult: unknown
	requiresAttentionAt: Date | null
	runAfter: Date
	createdAt: Date
	updatedAt: Date
	startedAt: Date | null
	finishedAt: Date | null
	finalErrorCode: string | null
	finalErrorDetail: string | null
	finalizationErrorCode: string | null
	finalizationErrorDetail: string | null
	finalizationStartedAt: Date | null
	finalizationFinishedAt: Date | null
}

export type PricingBulkJobItemRecord = {
	id: string
	ratePlanId: string
	productIdSnapshot: string
	productNameSnapshot: string | null
	variantIdSnapshot: string
	variantNameSnapshot: string | null
	status: PricingBulkJobItemStatus
	attempts: number
	ruleId: string | null
	previewResult: unknown
	materializationResult: unknown
	errorCode: string | null
	errorDetail: string | null
	commercialImpact: unknown
	startedAt: Date | null
	finishedAt: Date | null
}

export interface PricingBulkJobRepositoryPort {
	enqueue(input: {
		providerId: string
		requestedByUserId: string
		idempotencyKey: string
		payloadHash: string
		operationType: PricingBulkOperationType
		command: NormalizedPricingRuleCommand
		ratePlanIds: string[]
		maxAttempts: number
	}): Promise<{ job: PricingBulkJobRecord; replayed: boolean }>
	get(
		providerId: string,
		jobId: string
	): Promise<{
		job: PricingBulkJobRecord
		items: PricingBulkJobItemRecord[]
	} | null>
	retryFailed(input: {
		providerId: string
		requestedByUserId: string
		jobId: string
	}): Promise<PricingBulkJobRecord>
	cancelQueued(input: {
		providerId: string
		requestedByUserId: string
		jobId: string
	}): Promise<PricingBulkJobRecord>
}
