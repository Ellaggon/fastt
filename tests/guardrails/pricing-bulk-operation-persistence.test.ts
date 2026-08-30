import { readFileSync } from "node:fs"

import { getTableColumns, type Table } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { databaseTablesByDomain } from "@/shared/infrastructure/db/schema/registry"
import {
	PricingBulkOperationItem,
	PricingBulkOperationJob,
} from "@/shared/infrastructure/db/schema/tables"

function columnNames(table: Table) {
	return Object.values(getTableColumns(table)).map((column) => column.name)
}

describe("Pricing bulk operation persistence", () => {
	it("keeps immutable jobs and per-rate-plan outcomes as separate records", () => {
		expect(databaseTablesByDomain.pricing).toEqual(
			expect.arrayContaining(["PricingBulkOperationJob", "PricingBulkOperationItem"])
		)
		expect(columnNames(PricingBulkOperationJob)).toEqual(
			expect.arrayContaining([
				"providerId",
				"requestedByUserId",
				"idempotencyKey",
				"payloadHash",
				"commandJson",
				"runAfter",
				"lockedAt",
				"lockedBy",
				"finalizationAttempts",
				"finalizationMaxAttempts",
				"finalizationErrorCode",
				"finalizationStartedAt",
				"materializationCompletedAt",
				"cacheInvalidationCompletedAt",
				"ariEnqueueCompletedAt",
				"finalizationResultJson",
				"requiresAttentionAt",
			])
		)
		expect(columnNames(PricingBulkOperationItem)).toEqual(
			expect.arrayContaining([
				"jobId",
				"ratePlanId",
				"productIdSnapshot",
				"variantIdSnapshot",
				"previewResultJson",
				"materializationResultJson",
				"commercialImpactJson",
			])
		)
		expect(columnNames(PricingBulkOperationItem)).not.toContain("commandJson")
	})

	it("keeps idempotency, progress balance and immutable-command protections in the baseline", () => {
		const baseline = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")
		for (const fragment of [
			'CREATE TABLE "PricingBulkOperationJob"',
			'CREATE TABLE "PricingBulkOperationItem"',
			'CREATE UNIQUE INDEX "PricingBulkOperationJob_provider_idempotency_unique"',
			'CREATE UNIQUE INDEX "PricingBulkOperationItem_job_ratePlan_unique"',
			'"PricingBulkOperationJob_progress_balance_check"',
			'"PricingBulkOperationJob_finalizationAttempts_check"',
			"'finalizing'",
			'"PricingBulkOperationItem_jobId_fk"',
			'CREATE TRIGGER "trg_PricingBulkOperationJob_command_immutable"',
			"'preview_pricing_rule'",
			"'requires_attention'",
		]) {
			expect(baseline).toContain(fragment)
		}
		expect(baseline).not.toContain("'update_pricing_rule'")
		expect(baseline).not.toContain("'delete_pricing_rule'")
	})
})
