import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/calendar operational workspace", () => {
	it("keeps one-rate daily mutations in Calendar and scale operations in Multicalendario", () => {
		const calendar = read("src/pages/rates/calendar.astro")
		const workspace = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const catalog = read("src/lib/rates/calendarControlCatalog.ts")
		const source = `${calendar}\n${workspace}\n${catalog}`

		expect(calendar).toContain("SingleCalendarWorkspace")
		expect(calendar).toContain("client:load")
		expect(catalog).toContain("Cambiar precio")
		expect(catalog).toContain("Cambiar cupo")
		expect(catalog).toContain("Cerrar venta")
		expect(catalog).toContain("Ver condiciones")
		expect(workspace).toContain("Multicalendario")
		expect(catalog).toContain("professionalOnly")
		expect(source).not.toContain("Extender cambio")
		expect(source).not.toContain('key: "pro"')
		expect(
			existsSync(resolve(process.cwd(), "src/lib/rates/calendarOperationalController.ts"))
		).toBe(false)
		expect(
			existsSync(resolve(process.cwd(), "src/components/rates/CalendarOperationalPanel.astro"))
		).toBe(false)
	})
})
