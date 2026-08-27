import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	createExternalCalendarExportFlash,
	readExternalCalendarExportFlash,
} from "@/lib/provider-external-calendar-export-flash"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("iCal calendar relocation", () => {
	it("makes Calendar the only operational iCal workspace", () => {
		const calendar = read("src/pages/rates/calendar.astro")
		const connections = read("src/pages/rates/calendar/connections.astro")
		const subnav = read("src/components/rates/CalendarSubnav.astro")
		const workspace = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const legacyManage = read("src/pages/provider/settings/integrations/manage.astro")

		expect(calendar).toContain("<CalendarSubnav")
		expect(connections).not.toContain("<CalendarSubnav")
		expect(subnav).toContain("CALENDAR_CONTROL_MODES")
		expect(subnav).toContain("mode.label")
		expect(subnav).toContain("mode.helper")
		expect(subnav).toContain("fastt-tabs-inside-panel__status")
		expect(subnav).toContain("CircleDollarSign")
		expect(subnav).toContain('type="button"')
		expect(subnav).toContain("fastt:calendar-mode")
		expect(subnav).toContain("history.replaceState")
		expect(subnav).not.toContain('label: "Conexiones iCal"')
		expect(workspace).toContain("fastt:calendar-mode")
		expect(workspace).toContain("setMode")
		expect(connections).toContain("data-calendar-connections-workspace")
		expect(connections).toContain("data-external-calendars-mvp")
		expect(connections).toContain('view === "conflicts"')
		expect(connections).toContain('id: "exports"')
		expect(legacyManage).toContain("providerSettingsIntegrationsConnections")
		expect(legacyManage).not.toContain("connector-external_calendars")
		expect(legacyManage).not.toContain("data-external-calendars-mvp")
	})

	it("links every integration entry point to the calendar workspace", () => {
		const routes = read("src/lib/routes.ts")
		const summary = read("src/pages/provider/settings/integrations.astro")
		const catalog = read("src/pages/provider/settings/integrations/catalog.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")

		expect(routes).toContain('ratesCalendarConnections: () => "/rates/calendar/connections"')
		expect(summary).toContain(
			'if (connector.key === "external_calendars") return routes.ratesCalendarConnections()'
		)
		expect(catalog).toContain("href: routes.ratesCalendarConnections()")
		expect(connections).toContain("actionHref={routes.ratesCalendarConnections()}")
	})

	it("projects external blocks and open conflicts into calendar days", () => {
		const domain = read("src/lib/provider-external-calendars.ts")
		const surface = read("src/lib/rates/singleCalendarSurface.ts")
		const workspace = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const api = read("src/pages/api/rates/calendar.ts")
		const commercialRules = read("src/lib/commercial-rules/commercialRulesRepository.ts")

		expect(domain).toContain("listProviderExternalCalendarOverlay")
		expect(domain).toContain("ProviderExternalCalendarEvent.isActive")
		expect(domain).toContain('ProviderExternalCalendarConflict.status, "open"')
		expect(surface).toContain("externalCalendar:")
		expect(surface).toContain("listProviderExternalCalendarOverlay")
		expect(workspace).toContain("data-external-calendar-day")
		expect(workspace).toContain("data-external-calendar-conflict")
		expect(workspace).toContain("Bloqueo externo")
		expect(workspace).toContain("Conflicto por revisar")
		expect(api).toContain("providerId: auth.providerId")
		expect(commercialRules).toContain("db.execute")
		expect(commercialRules).not.toContain("(db as any).run")
	})

	it("keeps export tokens out of URLs and limits their one-time display", () => {
		const endpoint = read("src/pages/api/provider/integrations/external-calendars/exports/index.ts")
		const page = read("src/pages/rates/calendar/connections.astro")
		const value = createExternalCalendarExportFlash({
			providerId: "provider_test",
			exportId: "export_test",
			url: "https://fastt.test/api/ical?token=private",
		})

		expect(endpoint).toContain("httpOnly: true")
		expect(endpoint).toContain('sameSite: "lax"')
		expect(endpoint).not.toContain('searchParams.set("exportUrl"')
		expect(page).toContain("readExternalCalendarExportFlash")
		expect(page).toContain("Astro.cookies.delete")
		expect(readExternalCalendarExportFlash({ providerId: "provider_test", value })).toBe(
			"https://fastt.test/api/ical?token=private"
		)
		expect(readExternalCalendarExportFlash({ providerId: "another_provider", value })).toBeNull()
	})

	it("returns all iCal mutations to their calendar-owned views", () => {
		const files = [
			"src/pages/api/provider/integrations/external-calendars/feeds/index.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/sync-all.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/[calendarId]/sync.ts",
			"src/pages/api/provider/integrations/external-calendars/feeds/[calendarId]/revoke.ts",
			"src/pages/api/provider/integrations/external-calendars/exports/index.ts",
			"src/pages/api/provider/integrations/external-calendars/exports/[exportId]/revoke.ts",
			"src/pages/api/provider/integrations/external-calendars/conflicts/[conflictId]/resolve.ts",
		]

		for (const file of files) {
			expect(read(file), file).toContain('"/rates/calendar/connections"')
			expect(read(file), file).not.toContain('"/provider/settings/integrations/manage"')
		}
	})
})
