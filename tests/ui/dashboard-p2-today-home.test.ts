import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("dashboard P2 today board", () => {
	const dashboard = read("src/pages/dashboard/index.astro")
	const nav = read("src/lib/dashboard/providerOperationalNavigation.ts")

	it("turns operate home into a Today board when bookings exist", () => {
		expect(dashboard).toContain("showTodayBoard")
		expect(dashboard).toContain("data-dashboard-today")
		expect(dashboard).toContain("data-dashboard-today-empty")
		expect(dashboard).toContain("summarizeDashboardToday")
		expect(dashboard).toContain("bookingOperationsQueryRepository")
		expect(dashboard).not.toContain("financialOperations")
		expect(dashboard).toContain("!isSetupHome && !isChoosingForAddRoom")
	})

	it("keeps catalog Hotel/Tours KPIs only for multi-vertical operate homes", () => {
		expect(dashboard).toContain("showCrossVerticalKpis = !isSetupHome && operatedFamilies > 1")
		expect(dashboard).not.toContain('<WorkspaceMetricStat label="Salidas">')
		expect(dashboard).not.toContain('<WorkspaceMetricStat label="Habitaciones">')
	})

	it("does not strip operational sidebar destinations", () => {
		expect(nav).toContain("Salidas y cupos")
		expect(nav).toContain("Reservas")
		expect(nav).toContain("Tarifas")
		expect(nav).toContain("Finanzas")
		expect(nav).toContain("bookingDayOf")
	})
})
