import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
	pricingBulkJobLeaseToken,
	pricingBulkRetryDelayMs,
} from "@/lib/pricing/pricing-bulk-job-queue"
import { pricingBulkWorkerConfiguration } from "@/lib/pricing/pricing-bulk-job-worker"

const read = (path: string) => readFileSync(path, "utf8")

describe("pricing bulk job worker", () => {
	it("uses an isolated leased queue with bounded claims and retries", () => {
		const queue = read("src/lib/pricing/pricing-bulk-job-queue.ts")
		const worker = read("src/lib/pricing/pricing-bulk-job-worker.ts")

		expect(queue).toContain("FOR UPDATE SKIP LOCKED")
		expect(queue).toContain("FOR UPDATE OF item SKIP LOCKED")
		expect(queue).toContain("worker_lease_expired")
		expect(queue).toContain("refreshPricingBulkJobLease")
		expect(queue).toContain("releasePricingBulkJobLease")
		expect(queue).toContain("getPricingBulkQueueSnapshot")
		expect(queue).toContain("settlePricingBulkJobItems")
		expect(queue).toContain("completePricingBulkJobFinalization")
		expect(queue).toContain("checkpointPricingBulkMaterialization")
		expect(queue).toContain("checkpointPricingBulkEffect")
		expect(queue).toContain("requires_attention")
		expect(queue).toContain("finalizing")
		expect(worker).toContain("PRICING_BULK_WORKER_ITEM_CONCURRENCY, 3, 2, 4")
		expect(worker).toContain("pricingBulkRetryDelayMs")
		expect(worker).toContain("previewCandidate")
		expect(worker).toContain("createRule")
		expect(worker).toContain('executionMode: "deferred"')
		expect(worker).toContain("finalizeDeferredImpacts")
		expect(worker).toContain("PRICING_BULK_WORKER_TIME_BUDGET_MS")
		expect(worker).toContain("FINALIZATION_RESERVE_MS")
		expect(worker).toContain("error instanceof PricingBulkWorkerBudgetError")
		expect(worker).toContain("pricing_bulk_job_queue_latency_ms")
		expect(worker).toContain("pricing_bulk_worker_duration_ms")
		expect(worker).toContain("pricing_bulk_job_leases_recovered_total")
		expect(worker).toContain("pricing-bulk:${params.job.id}:${params.item.ratePlanId}")
		expect(worker).not.toContain("ProviderIntegrationSyncJob")
		expect(queue).not.toContain("ProviderIntegrationSyncJob")
	})

	it("creates distinct lease tokens and applies capped exponential backoff", () => {
		expect(pricingBulkJobLeaseToken()).not.toBe(pricingBulkJobLeaseToken())
		expect(pricingBulkRetryDelayMs(1)).toBe(30_000)
		expect(pricingBulkRetryDelayMs(2)).toBe(60_000)
		expect(pricingBulkRetryDelayMs(99)).toBe(3_600_000)
	})

	it("bounds environment configuration for a minute-based worker", () => {
		expect(
			pricingBulkWorkerConfiguration({
				PRICING_BULK_WORKER_JOB_BATCH_SIZE: "999",
				PRICING_BULK_WORKER_ITEM_BATCH_SIZE: "0",
				PRICING_BULK_WORKER_ITEM_CONCURRENCY: "99",
				PRICING_BULK_WORKER_LEASE_MS: "1",
				PRICING_BULK_WORKER_TIME_BUDGET_MS: "999999",
			})
		).toEqual({
			jobBatchSize: 20,
			itemBatchSize: 1,
			itemConcurrency: 4,
			leaseMs: 30_000,
			timeBudgetMs: 50_000,
		})
	})

	it("keeps the scheduler endpoint private and runs pricing work on a daily cadence", () => {
		const endpoint = read("src/pages/api/cron/pricing-bulk-jobs.ts")
		const vercel = read("vercel.json")

		expect(endpoint).toContain("verifyCronAuthorization")
		expect(endpoint).toContain("runPricingBulkJobWorker")
		expect(vercel).toContain('"path": "/api/cron/pricing-bulk-jobs"')
		expect(endpoint).toContain("maxDuration = 60")
		expect(vercel).toContain('"schedule": "37 4 * * *"')
	})
})
