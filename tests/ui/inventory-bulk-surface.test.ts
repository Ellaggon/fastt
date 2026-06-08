import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/inventory bulk surface", () => {
	it("inventory bulk page exposes preview/apply operations", () => {
		const source = read("src/pages/inventory/bulk.astro")
		expect(source).toContain("Operación avanzada de inventario")
		expect(source).toContain("la operación diaria de cupos vive en Calendario")
		expect(source).toContain("Volver a Inventario avanzado")
		expect(source).toContain("Ir al Calendario")
		expect(source).toContain('id="bulkPreviewBtn"')
		expect(source).toContain('id="bulkApplyBtn"')
		expect(source).toContain("/api/inventory/bulk-preview")
		expect(source).toContain("/api/inventory/bulk-apply")
		expect(source).not.toContain("Abrir ventas")
		expect(source).not.toContain("Cerrar ventas")
		expect(source).toContain("Gestionar vendibilidad en rule-sets")
		expect(source).toContain("Ajustar cupo")
	})

	it("inventory calendar links to bulk operations surface", () => {
		const source = read("src/pages/inventory/index.astro")
		expect(source).toContain("routes.inventoryBulk()")
		expect(source).toContain("Ajustar cupo fisico del rango")
		expect(source).toContain("mobile-calendar-action-sheet")
		expect(source).toContain("mobile-calendar-grid")
	})
})
