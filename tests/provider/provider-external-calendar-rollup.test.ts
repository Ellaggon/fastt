import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { computeExternalCalendarConnectionRollup } from "@/lib/provider-external-calendars"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("external calendar connection rollup", () => {
	it("maps empty / revoked / healthy / errored feed sets to connection status", () => {
		expect(
			computeExternalCalendarConnectionRollup({ activeFeeds: [], revokedFeedCount: 0 })
		).toMatchObject({ status: "not_configured", syncEnabled: false })

		expect(
			computeExternalCalendarConnectionRollup({ activeFeeds: [], revokedFeedCount: 2 })
		).toMatchObject({ status: "revoked", lastSyncStatus: "revoked", syncEnabled: false })

		expect(
			computeExternalCalendarConnectionRollup({
				activeFeeds: [
					{
						status: "pending",
						lastSyncAt: null,
						lastSyncStatus: null,
						lastError: null,
						consecutiveFailures: 0,
						nextSyncAt: null,
						syncEnabled: true,
					},
				],
				revokedFeedCount: 0,
			})
		).toMatchObject({ status: "pending", syncEnabled: false })

		const nextSyncAt = new Date("2026-08-10T00:00:00.000Z")
		expect(
			computeExternalCalendarConnectionRollup({
				activeFeeds: [
					{
						status: "active",
						lastSyncAt: new Date("2026-08-01T12:00:00.000Z"),
						lastSyncStatus: "success",
						lastError: null,
						consecutiveFailures: 0,
						nextSyncAt,
						syncEnabled: true,
					},
					{
						status: "active",
						lastSyncAt: new Date("2026-08-01T10:00:00.000Z"),
						lastSyncStatus: "not_modified",
						lastError: null,
						consecutiveFailures: 0,
						nextSyncAt: new Date("2026-08-11T00:00:00.000Z"),
						syncEnabled: true,
					},
				],
				revokedFeedCount: 1,
			})
		).toMatchObject({
			status: "connected",
			lastSyncStatus: "success",
			consecutiveFailures: 0,
			nextSyncAt,
			syncEnabled: false,
		})

		expect(
			computeExternalCalendarConnectionRollup({
				activeFeeds: [
					{
						status: "active",
						lastSyncAt: new Date("2026-08-01T12:00:00.000Z"),
						lastSyncStatus: "success",
						lastError: null,
						consecutiveFailures: 0,
						nextSyncAt: null,
						syncEnabled: true,
					},
					{
						status: "error",
						lastSyncAt: new Date("2026-08-01T13:00:00.000Z"),
						lastSyncStatus: "error",
						lastError: "ICAL_FETCH_TIMEOUT",
						consecutiveFailures: 3,
						nextSyncAt: nextSyncAt,
						syncEnabled: true,
					},
				],
				revokedFeedCount: 0,
			})
		).toMatchObject({
			status: "requires_attention",
			lastSyncStatus: "error",
			errorMessage: "ICAL_FETCH_TIMEOUT",
			consecutiveFailures: 3,
			syncEnabled: false,
		})
	})

	it("wires a single rollup writer for sync, revoke and job failure paths", () => {
		const domain = read("src/lib/provider-external-calendars.ts")
		const scheduler = read("src/lib/provider-external-calendar-scheduler.ts")
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const migration = read(
			"db/migrations/2026-08-07_provider_external_calendar_connection_rollup.sql"
		)

		expect(domain).toContain("export async function refreshExternalCalendarConnectionRollup")
		expect(domain).toContain("computeExternalCalendarConnectionRollup")
		expect(domain).toContain("await refreshExternalCalendarConnectionRollup(params.providerId)")
		expect(domain).not.toMatch(
			/update\(ProviderIntegrationConnection\)[\s\S]{0,120}status:\s*"connected"/
		)
		expect(domain).not.toMatch(
			/update\(ProviderIntegrationConnection\)[\s\S]{0,120}status:\s*"requires_attention"/
		)
		expect(scheduler).toContain("refreshExternalCalendarConnectionRollup")
		expect(schema).toContain('connectionId: txt("connectionId")')
		expect(migration).toContain('ALTER COLUMN "connectionId" SET NOT NULL')
		expect(migration).toContain("Due scheduling remains calendar-level")
	})
})
