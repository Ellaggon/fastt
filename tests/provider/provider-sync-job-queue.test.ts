import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { providerSyncJobRetryMinutes } from "@/lib/provider-sync-job-queue"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider universal sync job queue", () => {
	it("shares one backoff curve for connection and calendar workers", () => {
		expect(providerSyncJobRetryMinutes(1)).toBe(15)
		expect(providerSyncJobRetryMinutes(2)).toBe(30)
		expect(providerSyncJobRetryMinutes(8)).toBe(720)
	})

	it("keeps both domain schedulers on ProviderIntegrationSyncJob", () => {
		const integration = read("src/lib/provider-integration-scheduler.ts")
		const calendar = read("src/lib/provider-external-calendar-scheduler.ts")
		const queue = read("src/lib/provider-sync-job-queue.ts")
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const migration = read(
			"db/migrations/2026-08-06_provider_integration_universal_sync_job.sql"
		)

		expect(queue).toContain("claimQueuedProviderSyncJobs")
		expect(integration).toContain('targetType: "connection"')
		expect(calendar).toContain('targetType: "external_calendar"')
		expect(calendar).toContain("operation: \"calendar_import\"")
		expect(schema).toContain("ProviderIntegrationSyncJob_target_idempotency_unique")
		expect(schema).not.toContain("ProviderExternalCalendarSyncJob")
		expect(migration).toContain('DROP TABLE IF EXISTS "ProviderExternalCalendarSyncJob"')
		expect(migration).toContain("ProviderIntegrationSyncJob_target_idempotency_unique")
	})
})
