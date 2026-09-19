import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("dashboard P1 setup vs operate home", () => {
	const dashboard = read("src/pages/dashboard/index.astro")

	it("filters the listing by the same operational vertical as the sidebar", () => {
		expect(dashboard).toContain("filterProductsForWorkspaceScope")
		expect(dashboard).toContain("resolveOperationalSidebarVertical")
		expect(dashboard).toContain("isSetupHome")
		expect(dashboard).toContain("showAddAnotherService")
	})

	it("uses a visible setup heading instead of a hidden operational title", () => {
		const presentation = read("src/lib/dashboard/dashboardHomePresentation.ts")
		expect(dashboard).toContain("homeCopy.title")
		expect(presentation).toContain("Prepara tu tour")
		expect(dashboard).not.toContain('class="sr-only">Resumen Operativo')
	})

	it("keeps provider as a compact notice and hides add-service during setup", () => {
		expect(dashboard).toContain("data-dashboard-provider-notice")
		expect(dashboard).toContain("Cuenta de proveedor")
		expect(dashboard).toContain("showAddAnotherService = products.length > 0 && !isChoosingForAddRoom && !isSetupHome")
		expect(dashboard).not.toContain("Ir a proveedor")
	})

	it("hides operational KPIs while the visible catalog is still in setup", () => {
		expect(dashboard).toContain("showTodayBoard")
		expect(dashboard).toContain("showCrossVerticalKpis")
		expect(dashboard).toContain("isSetupHome")
	})
})
