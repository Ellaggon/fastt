import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("pricing bulk job API boundary", () => {
	it("keeps durable operations behind dedicated authenticated endpoints", () => {
		const enqueue = read("src/pages/api/pricing/bulk-jobs/index.ts")
		const status = read("src/pages/api/pricing/bulk-jobs/[id].ts")
		const retry = read("src/pages/api/pricing/bulk-jobs/[id]/retry.ts")
		const cancel = read("src/pages/api/pricing/bulk-jobs/[id]/cancel.ts")
		const legacyBulkApply = read("src/pages/api/pricing/rules/v2/bulk-apply.ts")
		const bulkPreview = read("src/pages/api/pricing/rules/v2/bulk-preview.ts")

		expect(enqueue).toContain("requireProvider(request)")
		expect(enqueue).toContain("requestIdempotencyKey")
		expect(enqueue).toContain("pricingBulkJobService.enqueue")
		expect(enqueue).not.toContain("applyBulkOperation")
		expect(status).toContain("pricingBulkJobService.get")
		expect(retry).toContain("pricingBulkJobService.retryFailed")
		expect(cancel).toContain("pricingBulkJobService.cancelQueued")
		expect(legacyBulkApply).toContain("pricingBulkJobService.enqueue")
		expect(legacyBulkApply).toContain("json(202")
		expect(legacyBulkApply).not.toContain("applyBulkOperation")
		expect(bulkPreview).toContain("ASYNC_PREVIEW_RATE_PLAN_THRESHOLD")
		expect(bulkPreview).toContain('mode: "preview"')
	})

	it("validates ownership and records each job mutation transactionally", () => {
		const repository = read(
			"src/modules/pricing/infrastructure/repositories/PricingBulkJobRepository.ts"
		)

		expect(repository).toContain("resolveOwnedTargets")
		expect(repository).toContain("bulk_rate_plan_ownership_invalid")
		expect(repository).toContain("onConflictDoNothing")
		expect(repository).toContain("ProviderAuditLog")
		expect(repository).toContain("bulk_job_idempotency_conflict")
		expect(repository).toContain("bulk_job_already_started")
	})
})
