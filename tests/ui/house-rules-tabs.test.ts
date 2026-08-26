import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/house-rules tabs", () => {
	it("cambia de pestaña en el cliente sin recargar lecturas del servidor", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const controller = read("src/pages/provider/_client/house-rules-tabs.ts")

		expect(page).toContain("data-house-rules-tabs")
		expect(page).toContain("data-house-rules-tab")
		expect(page).toContain("data-house-rules-panel")
		expect(page).toContain("houseRuleEditorViews.map")
		expect(page).toContain('data-house-rules-panel="preview"')
		expect(page).toContain("installHouseRulesTabsController")
		expect(controller).toContain("renderHouseRulesView")
		expect(controller).toContain("event.preventDefault()")
		expect(controller).toContain("{ capture: true }")
		expect(controller).toContain("window.history.pushState")
		expect(controller).toContain('document.addEventListener("astro:page-load"')
		expect(controller).toContain("toggleAttribute")
		expect(page).not.toContain("activeEditorTypes")
	})
})
