import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("dashboard P0 vertical home", () => {
	const dashboard = read("src/pages/dashboard/index.astro")

	it("does not paint a Hotel KPI when that vertical is empty", () => {
		expect(dashboard).toContain("operatedFamilies")
		expect(dashboard).toContain("showCrossVerticalKpis")
		expect(dashboard).toContain('<WorkspaceMetricStat label="Alojamientos">')
		expect(dashboard).toContain('<WorkspaceMetricStat label="Tours">')
		expect(dashboard).not.toContain('<WorkspaceMetricStat label="Hotel">')
	})

	it("uses real Spanish inventory copy instead of concatenating s", () => {
		expect(dashboard).toContain("Sin salidas todavía")
		expect(dashboard).toContain("variantInventorySummary")
		expect(dashboard).toContain("spanishCount")
		expect(dashboard).not.toContain("{product.rooms.length} {variantLabel}")
		expect(dashboard).not.toContain("{activeCount} activa")
	})

	it("keeps a single setup CTA and hides empty inventory plus operational shortcuts", () => {
		expect(dashboard).toContain("Continuar preparación")
		expect(dashboard).toContain("showOpsActions = isChoosingForAddRoom || isPublished")
		expect(dashboard).toContain("showInventoryStats = hasVariants")
		expect(dashboard).toContain("data-dashboard-ops-aside")
		expect(dashboard).toContain("data-inventory-stats")
		expect(dashboard).toContain("data-ops-actions")
	})

	it("uses tour vocabulary on tour surfaces", () => {
		expect(dashboard).toContain("const VerticalIcon = isTour ? MapIcon : Hotel")
		expect(dashboard).toContain("Agrega otro tour u otra línea")
		expect(dashboard).toContain("Publicado y visible para viajeros.")
		expect(dashboard).toContain("Si quieres sumar espacios dentro del mismo hotel, crea habitaciones.")
	})
})
