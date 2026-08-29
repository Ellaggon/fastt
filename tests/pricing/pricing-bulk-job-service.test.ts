import { describe, expect, it, vi } from "vitest"

import {
	PricingBulkJobError,
	PricingBulkJobService,
	type PricingBulkJobRepositoryPort,
} from "@/modules/pricing/public"

const job = {
	id: "job-1",
	providerId: "provider-1",
	requestedByUserId: "user-1",
	idempotencyKey: "request-1",
	payloadHash: "a".repeat(64),
	operationType: "create_pricing_rule" as const,
	command: { type: "percentage_markup", value: 10, priority: 10 },
	status: "queued" as const,
	totalItems: 2,
	pendingItems: 2,
	runningItems: 0,
	completedItems: 0,
	succeededItems: 0,
	failedItems: 0,
	skippedItems: 0,
	cancelledItems: 0,
	attempts: 0,
	maxAttempts: 3,
	runAfter: new Date("2026-10-08T00:00:00.000Z"),
	createdAt: new Date("2026-10-08T00:00:00.000Z"),
	updatedAt: new Date("2026-10-08T00:00:00.000Z"),
	startedAt: null,
	finishedAt: null,
	finalErrorCode: null,
	finalErrorDetail: null,
}

function repository(): PricingBulkJobRepositoryPort {
	return {
		enqueue: vi.fn().mockResolvedValue({ job, replayed: false }),
		get: vi.fn().mockResolvedValue({ job, items: [] }),
		retryFailed: vi.fn().mockResolvedValue(job),
		cancelQueued: vi.fn().mockResolvedValue(job),
	}
}

describe("PricingBulkJobService", () => {
	it("normalizes a command and canonicalizes targets before persisting a job", async () => {
		const repo = repository()
		const service = new PricingBulkJobService(repo)

		await service.enqueue({
			providerId: "provider-1",
			requestedByUserId: "user-1",
			input: {
				ratePlanIds: ["rate-plan-b", "rate-plan-a", "rate-plan-b"],
				idempotencyKey: "request-1",
				operation: {
					type: "percentage",
					value: 10,
					conditions: { effectiveFrom: "2026-10-10", effectiveDays: 3 },
				},
			},
		})

		expect(repo.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				ratePlanIds: ["rate-plan-a", "rate-plan-b"],
				idempotencyKey: "request-1",
				command: expect.objectContaining({
					type: "percentage_markup",
					dateFrom: "2026-10-10",
					dateTo: "2026-10-12",
				}),
			})
		)
	})

	it("requires an idempotency key before any persistence work", async () => {
		const repo = repository()
		const service = new PricingBulkJobService(repo)

		await expect(
			service.enqueue({
				providerId: "provider-1",
				requestedByUserId: "user-1",
				input: { ratePlanIds: ["rate-plan-a"], operation: { type: "percentage", value: 10 } },
			})
		).rejects.toEqual(new PricingBulkJobError("idempotency_key_required"))
		expect(repo.enqueue).not.toHaveBeenCalled()
	})

	it("persists large previews as read-only jobs", async () => {
		const repo = repository()
		const service = new PricingBulkJobService(repo)

		await service.enqueue({
			providerId: "provider-1",
			requestedByUserId: "user-1",
			input: {
				ratePlanIds: ["rate-plan-a"],
				idempotencyKey: "preview-1",
				mode: "preview",
				operation: { type: "percentage", value: 8 },
			},
		})

		expect(repo.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({ operationType: "preview_pricing_rule" })
		)
	})
})
