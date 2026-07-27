import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider external calendars resources + conflict actions", () => {
	it("wires physical resources, persisted conflicts and host actions", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const domain = read("src/lib/provider-external-calendars.ts")
		const repo = read("src/modules/inventory/infrastructure/repositories/InventoryRecomputeRepository.ts")
		const page = read("src/pages/provider/settings/integrations.astro")
		const api = read(
			"src/pages/api/provider/integrations/external-calendars/conflicts/[conflictId]/resolve.ts"
		)

		expect(schema).toContain("InventoryResource")
		expect(schema).toContain("ProviderExternalCalendarConflict")
		expect(schema).toContain("ProviderExternalCalendarExport")
		expect(schema).not.toContain("ProviderExternalCalendarSyncJob")
		expect(schema).toContain('targetType: text("targetType")')
		expect(schema).toContain('resourceId: txtOpt("resourceId")')
		expect(domain).toContain("X-FASTT-SOURCE:fastt")
		expect(domain).toContain("isFasttExportedEvent")
		expect(domain).toContain("renderProviderExternalCalendarExport")
		expect(domain).toContain("resolveCalendarResource")
		expect(domain).toContain("reconcileExternalCalendarConflicts")
		expect(domain).toContain("resolveProviderExternalCalendarConflict")
		expect(read("src/lib/provider-external-calendar-scheduler.ts")).toContain(
			'targetType: "external_calendar"'
		)
		expect(read("src/lib/provider-external-calendar-scheduler.ts")).toContain(
			"ProviderIntegrationSyncJob"
		)
		expect(repo).toContain("resource:")
		expect(repo).toContain("event:")
		expect(page).toContain("Unidad física")
		expect(page).toContain("Alertas de solapamiento")
		expect(page).toContain("Solo gestionan la alerta")
		expect(page).toContain("Aceptar alerta")
		expect(page).toContain("Ignorar alerta")
		expect(page).toContain("Marcar resuelto")
		expect(page).toContain("no cambia la disponibilidad")
		expect(page).toContain("Exportar calendario Fastt")
		expect(page).toContain("Crear enlace iCal")
		expect(domain).toContain("Alert-inbox only")
		expect(domain).toContain('eq(ProviderExternalCalendarConflict.status, "open")')
		expect(domain).not.toMatch(
			/reconcileExternalCalendarConflicts[\s\S]{0,200}recordProviderIntegrationIncident/
		)
		expect(api).toContain("requireProviderIntegrationManager")
	})
})
