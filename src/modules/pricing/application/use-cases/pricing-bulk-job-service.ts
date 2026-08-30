import { createHash } from "node:crypto"

import {
	PRICING_BULK_DEFAULT_MAX_ATTEMPTS,
	PRICING_BULK_MAX_RATE_PLANS,
} from "../pricing-bulk-policy"
import {
	normalizedPricingRuleCommandFromBulkOperation,
	type BulkPricingOperation,
} from "./pricing-bulk-command"
import type {
	PricingBulkJobRecord,
	PricingBulkOperationType,
	PricingBulkJobRepositoryPort,
} from "../ports/PricingBulkJobRepositoryPort"

export class PricingBulkJobError extends Error {
	constructor(
		public readonly code: string,
		public readonly status = 400
	) {
		super(code)
		this.name = "PricingBulkJobError"
	}
}

export type EnqueuePricingBulkJobInput = {
	ratePlanIds: string[]
	operation: BulkPricingOperation
	idempotencyKey?: string | null
	maxAttempts?: number
	mode?: "apply" | "preview"
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`
}

function normalizedRatePlanIds(value: string[]): string[] {
	const ids = Array.from(new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean)))
	if (!ids.length || ids.length > PRICING_BULK_MAX_RATE_PLANS)
		throw new PricingBulkJobError("bulk_job_rate_plan_count_invalid")
	return ids.sort()
}

function requiredIdempotencyKey(value: string | null | undefined): string {
	const key = String(value ?? "").trim()
	if (!key) throw new PricingBulkJobError("idempotency_key_required")
	if (key.length > 200) throw new PricingBulkJobError("invalid_idempotency_key")
	return key
}

function normalizedAttempts(value: number | undefined): number {
	if (value == null) return PRICING_BULK_DEFAULT_MAX_ATTEMPTS
	if (!Number.isInteger(value) || value < 1 || value > 10) {
		throw new PricingBulkJobError("bulk_job_max_attempts_invalid")
	}
	return value
}

function payloadHash(input: {
	ratePlanIds: string[]
	command: unknown
	maxAttempts: number
	operationType: PricingBulkOperationType
}) {
	return createHash("sha256")
		.update(
			stableJson({
				operationType: input.operationType,
				ratePlanIds: input.ratePlanIds,
				command: input.command,
				maxAttempts: input.maxAttempts,
			})
		)
		.digest("hex")
}

export class PricingBulkJobService {
	constructor(private readonly repository: PricingBulkJobRepositoryPort) {}

	async enqueue(params: {
		providerId: string
		requestedByUserId: string
		input: EnqueuePricingBulkJobInput
	}): Promise<{ job: PricingBulkJobRecord; replayed: boolean }> {
		const providerId = String(params.providerId ?? "").trim()
		const requestedByUserId = String(params.requestedByUserId ?? "").trim()
		if (!providerId || !requestedByUserId)
			throw new PricingBulkJobError("provider_or_actor_required", 403)
		const ratePlanIds = normalizedRatePlanIds(params.input.ratePlanIds)
		const idempotencyKey = requiredIdempotencyKey(params.input.idempotencyKey)
		const command = normalizedPricingRuleCommandFromBulkOperation(params.input.operation)
		const maxAttempts = normalizedAttempts(params.input.maxAttempts)
		const operationType: PricingBulkOperationType =
			params.input.mode === "preview" ? "preview_pricing_rule" : "create_pricing_rule"
		return this.repository.enqueue({
			providerId,
			requestedByUserId,
			idempotencyKey,
			payloadHash: payloadHash({ ratePlanIds, command, maxAttempts, operationType }),
			operationType,
			command,
			ratePlanIds,
			maxAttempts,
		})
	}

	async get(params: { providerId: string; jobId: string }) {
		const jobId = String(params.jobId ?? "").trim()
		if (!jobId) throw new PricingBulkJobError("bulk_job_id_required")
		return this.repository.get(String(params.providerId ?? "").trim(), jobId)
	}

	async retryFailed(params: { providerId: string; requestedByUserId: string; jobId: string }) {
		return this.repository.retryFailed({
			providerId: String(params.providerId ?? "").trim(),
			requestedByUserId: String(params.requestedByUserId ?? "").trim(),
			jobId: String(params.jobId ?? "").trim(),
		})
	}

	async cancelQueued(params: { providerId: string; requestedByUserId: string; jobId: string }) {
		return this.repository.cancelQueued({
			providerId: String(params.providerId ?? "").trim(),
			requestedByUserId: String(params.requestedByUserId ?? "").trim(),
			jobId: String(params.jobId ?? "").trim(),
		})
	}
}
