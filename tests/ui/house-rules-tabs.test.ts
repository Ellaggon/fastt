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
		expect(page).toContain("Pendientes")
		expect(page).toContain("Áreas completadas")
		expect(page).toContain("data-house-rules-complete-areas")
		expect(page).toContain("HouseRuleEditorRow")
		expect(page).toContain("Una regla a la vez")
		expect(controller).toContain("renderHouseRulesView")
		expect(controller).toContain("event.preventDefault()")
		expect(controller).toContain("{ capture: true }")
		expect(controller).toContain("window.history.pushState")
		expect(controller).toContain('document.addEventListener("astro:page-load"')
		expect(controller).toContain("toggleAttribute")
		expect(page).not.toContain("activeEditorTypes")
	})

	it("lista reglas como pendientes y áreas completadas al estilo settings", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const row = read("src/components/house-rules/HouseRuleEditorRow.astro")
		const copy = read("src/modules/house-rules/presentation/houseRulePresentation.ts")

		expect(page).toContain('variant="flush"')
		expect(page).toContain("bg-sky-50/80")
		expect(page).toContain("CircleCheck")
		expect(page).toContain("Mostrar")
		expect(page).toContain("Ocultar")
		expect(row).toContain("fastt-row-card")
		expect(row).toContain("fastt-row-card-alert")
		expect(row).toContain("Pendiente")
		expect(row).toContain("Completo")
		expect(row).not.toContain("openByDefault")
		expect(row).not.toContain("open={")
		expect(page).not.toContain("openByDefault")
		expect(row).toContain("copy.pendingImpact")
		expect(row).not.toContain(">Agregar<")
		expect(row).not.toContain(">Falta<")
		expect(copy).toContain("pendingImpact")
		expect(copy).toContain("El huésped no sabrá si puede traer mascotas")
	})

	it("resume el progreso esencial con el coach oscuro, sin copiar el embudo de settings", () => {
		const page = read("src/pages/provider/house-rules.astro")

		expect(page).toContain('<Card variant="dark" class="!border-neutral-800 !bg-black">')
		expect(page).toContain("data-house-rules-coach")
		expect(page).toContain("Reglas esenciales")
		expect(page).toContain("En la ficha")
		expect(page).toContain('variant="darkNeutral"')
		expect(page).toContain("missingEssentials.map")
		expect(page).toContain("{selectedReady ? \"Listas\" : \"Pendiente\"}")
		expect(page).not.toContain("Siguiente requisito")
		expect(page).not.toContain("nextHouseRuleLabel")
		expect(page).not.toContain("Ver mascotas")
		expect(page).not.toContain("Completa las expectativas básicas de comportamiento")
	})

	it("usa BottomToast reutilizable para confirmaciones de guardado", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const toast = read("src/components/ui/BottomToast.astro")

		expect(page).toContain("BottomToast")
		expect(page).toContain('clearQueryParam="success"')
		expect(page).toContain("Cambio guardado. Quedan")
		expect(toast).toContain("data-bottom-toast-dismiss")
		expect(page).not.toContain("border-green-200 bg-green-50")
		expect(page).not.toContain("house-rules-feedback-toast")
	})
})
