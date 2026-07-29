import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	assertProviderConnectorMode,
	assertProviderConnectorStatus,
	PROVIDER_CONNECTOR_STATUSES,
} from "@/lib/provider-integrations"
import {
	assertProviderExternalCalendarStatus,
	PROVIDER_EXTERNAL_CALENDAR_STATUSES,
} from "@/lib/provider-external-calendars"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("Phase 7: status CHECKs + export honesty", () => {
	it("rejects invalid Connection and Calendar status vocabularies", () => {
		expect(assertProviderConnectorStatus("connected")).toBe("connected")
		expect(assertProviderConnectorMode("production")).toBe("production")
		expect(assertProviderExternalCalendarStatus("active")).toBe("active")
		expect(() => assertProviderConnectorStatus("bogus")).toThrow("CONNECTION_STATUS_INVALID")
		expect(() => assertProviderConnectorMode("live")).toThrow("CONNECTION_MODE_INVALID")
		expect(() => assertProviderExternalCalendarStatus("connected")).toThrow(
			"ICAL_CALENDAR_STATUS_INVALID"
		)
		expect(PROVIDER_CONNECTOR_STATUSES).toContain("requires_attention")
		expect(PROVIDER_EXTERNAL_CALENDAR_STATUSES).toEqual(["pending", "active", "error", "revoked"])
	})

	it("ships status CHECKs and cascade in the hardening migration", () => {
		const migration = read("db/migrations/2026-08-08_provider_integration_constraint_hardening.sql")
		expect(migration).toContain("ProviderIntegrationConnection_status_check")
		expect(migration).toContain("ProviderIntegrationConnection_mode_check")
		expect(migration).toContain("ProviderExternalCalendar_status_check")
		expect(migration).toContain("ProviderExternalCalendarExport_status_check")
		expect(migration).toContain("ProviderExternalCalendarConflict_status_check")
		expect(migration).toContain("ProviderIntegrationSyncJob_status_check")
		expect(migration).toContain('WHERE "syncEnabled" = TRUE AND "status" <> \'revoked\'')
		expect(migration).toContain("ProviderExternalCalendar_connectionId_fkey")
		expect(migration).toContain("ON DELETE CASCADE")
		expect(migration).toContain('SET "resourceId" = NULL')
	})

	it("mirrors partial due-sync indexes and CHECKs in Drizzle tables.ts", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		expect(schema).toContain('"ProviderIntegrationConnection_status_check"')
		expect(schema).toContain('"ProviderExternalCalendar_status_check"')
		expect(schema).toContain("table.syncEnabled} = true AND ${table.status} <> 'revoked'")
		expect(schema).toMatch(
			/connectionId: txt\("connectionId"\)\.references\(\(\) => ProviderIntegrationConnection\.id, \{\s*onDelete: "cascade"/
		)
		const exportTable = schema.match(
			/export const ProviderExternalCalendarExport[\s\S]*?export const VariantCapacity/
		)?.[0]
		expect(exportTable).toBeTruthy()
		expect(exportTable).not.toContain("resourceId")
	})

	it("keeps outbound ICS variant-scoped and removes the unused resource column", () => {
		const domain = read("src/lib/provider-external-calendars.ts")
		const api = read("src/pages/api/provider/integrations/external-calendars/exports/index.ts")
		const page = read("src/pages/provider/settings/integrations.astro")
		const migration = read(
			"db/migrations/2026-08-10_provider_external_calendar_export_variant_scope.sql"
		)

		expect(domain).not.toContain("X-FASTT-RESOURCE-ID")
		expect(api).not.toContain("resourceId")
		expect(migration).toContain('DROP COLUMN IF EXISTS "resourceId"')
		expect(page).toContain("data-external-calendar-export")
		expect(page).toContain("El alcance es la habitación completa")
		expect(page).not.toMatch(/data-external-calendar-export[\s\S]*?name="resourceId"/)
		// Inbound feed form still binds physical units.
		expect(page).toMatch(/external-calendars\/feeds[\s\S]*?name="resourceId"/)
	})
})
