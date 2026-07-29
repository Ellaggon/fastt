import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it } from "vitest"

import { providerIntegrationRetentionPolicy } from "@/lib/provider-integration-maintenance"

const read = (path: string) => readFileSync(path, "utf8")
const originalEnv = { ...process.env }

afterEach(() => {
	process.env = { ...originalEnv }
})

describe("provider integration performance and operations", () => {
	it("uses bounded, differentiated retention defaults", () => {
		expect(providerIntegrationRetentionPolicy()).toEqual({
			inactiveEventDays: 30,
			endedEventDays: 180,
			successfulRunDays: 90,
			failedRunDays: 180,
			successfulJobDays: 14,
			failedJobDays: 90,
			batchSize: 1000,
		})

		process.env.PROVIDER_INTEGRATION_PURGE_BATCH_SIZE = "999999"
		process.env.PROVIDER_INTEGRATION_SUCCESSFUL_JOB_RETENTION_DAYS = "0"
		expect(providerIntegrationRetentionPolicy().batchSize).toBe(5000)
		expect(providerIntegrationRetentionPolicy().successfulJobDays).toBe(1)
	})

	it("purges only terminal or historical data in bounded locked batches", () => {
		const maintenance = read("src/lib/provider-integration-maintenance.ts")
		expect(maintenance).toContain("FOR UPDATE SKIP LOCKED")
		expect(maintenance).toContain(`"status" = 'succeeded'`)
		expect(maintenance).toContain(`"status" = 'failed'`)
		expect(maintenance).toContain(`"status" IN ('succeeded', 'cancelled')`)
		expect(maintenance).toContain(`"status" IN ('failed', 'partial')`)
		expect(maintenance).not.toMatch(/"status"\s*=\s*'queued'[\s\S]{0,120}DELETE/)
		expect(maintenance).not.toMatch(/"status"\s*=\s*'running'[\s\S]{0,120}DELETE/)
	})

	it("bounds fair job ranking before claiming work", () => {
		const queue = read("src/lib/provider-sync-job-queue.ts")
		expect(queue).toContain("candidateLimit")
		expect(queue).toContain("4000")
		expect(queue.indexOf("WITH candidates AS")).toBeLessThan(queue.indexOf("ranked AS"))
		expect(queue).toContain("FOR UPDATE OF job SKIP LOCKED")
		expect(queue).toContain("round < 3")
	})

	it("ships non-redundant indexes for claims, due feeds, active ranges and retention", () => {
		const migration = read(
			"db/migrations/2026-08-11_provider_integration_operations_performance.sql"
		)
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const baseline = read("db/postgres/0001_initial_schema.sql")
		for (const index of [
			"ProviderIntegrationSyncJob_claim_due_idx",
			"ProviderIntegrationSyncJob_terminal_retention_idx",
			"ProviderExternalCalendar_due_sync_idx",
			"ProviderExternalCalendarEvent_variant_active_range_idx",
			"ProviderExternalCalendarEvent_resource_active_range_idx",
			"ProviderExternalCalendarEvent_inactive_retention_idx",
			"ProviderIntegrationSyncRun_terminal_retention_idx",
			"ProviderIntegrationIncident_open_last_seen_idx",
		]) {
			expect(migration).toContain(index)
			expect(schema).toContain(index)
			expect(baseline).toContain(index)
		}
		expect(schema).not.toContain("ProviderIntegrationSyncJob_target_due_idx")
		expect(schema).not.toContain("ProviderIntegrationSyncJob_due_idx")
	})

	it("exports database gauges and worker counters through Prometheus", () => {
		const collector = read("src/lib/provider-integration-operational-metrics.ts")
		const prometheus = read("src/pages/api/internal/observability/prometheus.ts")
		const queue = read("src/lib/provider-sync-job-queue.ts")
		for (const metric of [
			"provider_integration_queue_depth",
			"provider_integration_queue_oldest_age_seconds",
			"provider_integration_queue_retry_jobs",
			"provider_integration_consecutive_failures_max",
			"provider_external_calendar_events",
			"provider_integration_run_duration_p95_ms",
		]) {
			expect(collector).toContain(metric)
		}
		expect(prometheus).toContain("collectProviderIntegrationOperationalMetrics")
		expect(queue).toContain("provider_integration_job_queue_latency_ms")
		expect(queue).toContain("provider_integration_job_retries_total")
	})

	it("schedules the authenticated maintenance endpoint", () => {
		const endpoint = read("src/pages/api/cron/provider-integration-maintenance.ts")
		const vercel = read("vercel.json")
		expect(endpoint).toContain("verifyCronAuthorization")
		expect(endpoint).toContain("purgeProviderIntegrationOperationalData")
		expect(vercel).toContain("/api/cron/provider-integration-maintenance")
	})
})
