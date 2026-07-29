import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { collectProviderIntegrationOperationalMetrics } from "@/lib/provider-integration-operational-metrics"
import { purgeProviderIntegrationOperationalData } from "@/lib/provider-integration-maintenance"
import { closePostgresClients } from "@/shared/infrastructure/db/client"

const connectionUrl =
	process.env.DIRECT_URL?.trim() ||
	process.env.SUPABASE_DB_URL?.trim() ||
	process.env.DATABASE_URL?.trim() ||
	""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `integration-maintenance-${randomUUID()}`
const ids = {
	provider: `${prefix}-provider`,
	destination: `${prefix}-destination`,
	product: `${prefix}-product`,
	variant: `${prefix}-variant`,
	connection: `${prefix}-connection`,
	calendar: `${prefix}-calendar`,
}

describePostgres("provider integration operational maintenance", () => {
	let sql: postgres.Sql

	async function cleanup() {
		await sql`delete from "ProviderIntegrationSyncJob" where "providerId" = ${ids.provider}`
		await sql`delete from "ProviderIntegrationIncident" where "providerId" = ${ids.provider}`
		await sql`delete from "ProviderIntegrationSyncRun" where "providerId" = ${ids.provider}`
		await sql`delete from "ProviderExternalCalendarEvent" where "providerId" = ${ids.provider}`
		await sql`delete from "ProviderExternalCalendar" where "providerId" = ${ids.provider}`
		await sql`delete from "ProviderIntegrationConnection" where "providerId" = ${ids.provider}`
		await sql`delete from "Variant" where "id" = ${ids.variant}`
		await sql`delete from "Product" where "id" = ${ids.product}`
		await sql`delete from "Destination" where "id" = ${ids.destination}`
		await sql`delete from "Provider" where "id" = ${ids.provider}`
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
		await cleanup()
		await sql`
			insert into "Provider" ("id", "legalName", "displayName", "status", "createdAt")
			values (${ids.provider}, 'Maintenance Provider', 'Maintenance Provider', 'active', now())
		`
		await sql`
			insert into "Destination" ("id", "name", "type", "country", "slug")
			values (${ids.destination}, 'Maintenance', 'city', 'CL', ${ids.destination})
		`
		await sql`
			insert into "Product" ("id", "name", "productType", "providerId", "destinationId")
			values (${ids.product}, 'Maintenance Hotel', 'hotel', ${ids.provider}, ${ids.destination})
		`
		await sql`
			insert into "Variant" ("id", "productId", "name", "kind", "status", "isActive")
			values (${ids.variant}, ${ids.product}, 'Maintenance Room', 'room', 'ready', true)
		`
		await sql`
			insert into "ProviderIntegrationConnection" (
				"id", "providerId", "connectorKey", "status", "mode", "createdAt", "updatedAt"
			)
			values (
				${ids.connection}, ${ids.provider}, 'external_calendars', 'connected', 'production',
				now(), now()
			)
		`
		await sql`
			insert into "ProviderExternalCalendar" (
				"id", "providerId", "connectionId", "variantId", "name", "feedUrlEncrypted",
				"feedUrlHost", "feedUrlFingerprint", "status", "nextSyncAt", "createdAt", "updatedAt"
			)
			values (
				${ids.calendar}, ${ids.provider}, ${ids.connection}, ${ids.variant}, 'Maintenance Feed',
				${sql.json({ version: 1, ciphertext: "test" })}, 'example.test', ${prefix}, 'active',
				now(), now(), now()
			)
		`
		await sql`
			insert into "ProviderExternalCalendarEvent" (
				"id", "calendarId", "providerId", "variantId", "sourceKey", "externalUid",
				"startDate", "endDate", "fingerprint", "isActive", "firstSeenAt", "lastSeenAt"
			)
			values
				(${`${prefix}-inactive`}, ${ids.calendar}, ${ids.provider}, ${ids.variant}, 'inactive',
					'inactive', '2025-01-01', '2025-01-02', 'inactive', false, '2025-01-01', '2025-01-02'),
				(${`${prefix}-ended`}, ${ids.calendar}, ${ids.provider}, ${ids.variant}, 'ended',
					'ended', '2025-01-03', '2025-01-04', 'ended', true, '2025-01-03', '2025-01-04'),
				(${`${prefix}-current`}, ${ids.calendar}, ${ids.provider}, ${ids.variant}, 'current',
					'current', '2026-08-01', '2026-08-03', 'current', true, now(), now())
		`
		await sql`
			insert into "ProviderIntegrationSyncRun" (
				"id", "providerId", "connectionId", "connectorKey", "operation", "status",
				"startedAt", "finishedAt", "createdAt"
			)
			values
				(${`${prefix}-run-success`}, ${ids.provider}, ${ids.connection}, 'external_calendars',
					'calendar_import', 'succeeded', '2025-01-01', '2025-01-01', '2025-01-01'),
				(${`${prefix}-run-failed`}, ${ids.provider}, ${ids.connection}, 'external_calendars',
					'calendar_import', 'failed', '2025-01-01', '2025-01-01', '2025-01-01'),
				(${`${prefix}-run-running`}, ${ids.provider}, ${ids.connection}, 'external_calendars',
					'calendar_import', 'running', now(), null, now()),
				(${`${prefix}-run-recent`}, ${ids.provider}, ${ids.connection}, 'external_calendars',
					'calendar_import', 'succeeded', now() - interval '2 seconds', now(), now())
		`
		await sql`
			insert into "ProviderIntegrationSyncJob" (
				"id", "providerId", "connectionId", "targetType", "targetId", "connectorKey",
				"operation", "status", "trigger", "priority", "attempts", "maxAttempts", "runAfter",
				"idempotencyKey", "createdAt", "updatedAt", "finishedAt"
			)
			values
				(${`${prefix}-job-success`}, ${ids.provider}, ${ids.connection}, 'connection',
					${ids.connection}, 'external_calendars', 'connection_test', 'succeeded', 'scheduled',
					100, 0, 5, '2025-01-01', ${`${prefix}-success`}, '2025-01-01', '2025-01-01',
					'2025-01-01'),
				(${`${prefix}-job-failed`}, ${ids.provider}, ${ids.connection}, 'connection',
					${ids.connection}, 'external_calendars', 'connection_test', 'failed', 'scheduled',
					100, 5, 5, '2025-01-01', ${`${prefix}-failed`}, '2025-01-01', '2025-01-01',
					'2025-01-01'),
				(${`${prefix}-job-queued`}, ${ids.provider}, ${ids.connection}, 'connection',
					${ids.connection}, 'external_calendars', 'connection_test', 'queued', 'scheduled',
					100, 1, 5, now(), ${`${prefix}-queued`}, now(), now(), null)
		`
	})

	afterAll(async () => {
		await cleanup()
		await sql.end()
		await closePostgresClients()
	})

	it("purges expired history while preserving live operational state", async () => {
		const result = await purgeProviderIntegrationOperationalData({
			providerId: ids.provider,
			now: new Date("2026-07-28T12:00:00.000Z"),
			policy: {
				inactiveEventDays: 30,
				endedEventDays: 180,
				successfulRunDays: 90,
				failedRunDays: 180,
				successfulJobDays: 14,
				failedJobDays: 90,
				batchSize: 100,
			},
		})
		expect(result).toMatchObject({
			inactiveEvents: 1,
			endedEvents: 1,
			successfulRuns: 1,
			failedRuns: 1,
			successfulJobs: 1,
			failedJobs: 1,
			totalPurged: 6,
		})

		const events = await sql`
			select "id" from "ProviderExternalCalendarEvent" where "providerId" = ${ids.provider}
		`
		const runs = await sql`
			select "status" from "ProviderIntegrationSyncRun" where "providerId" = ${ids.provider}
		`
		const jobs = await sql`
			select "status" from "ProviderIntegrationSyncJob" where "providerId" = ${ids.provider}
		`
		expect(events.map((row) => row.id)).toEqual([`${prefix}-current`])
		expect(runs.map((row) => row.status).sort()).toEqual(["running", "succeeded"])
		expect(jobs.map((row) => row.status)).toEqual(["queued"])
	})

	it("collects queue, failure, event and latency gauges from PostgreSQL", async () => {
		const metrics = await collectProviderIntegrationOperationalMetrics()
		const names = new Set(metrics.map((metric) => metric.name))
		expect(names).toContain("provider_integration_queue_depth")
		expect(names).toContain("provider_integration_queue_retry_jobs")
		expect(names).toContain("provider_integration_consecutive_failures_max")
		expect(names).toContain("provider_external_calendar_events")
		expect(names).toContain("provider_integration_run_duration_p95_ms")
	})
})
