import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("tour commercial wizard", () => {
	it("gates tickets and categories behind one guided save", () => {
		const source = read("src/pages/product/[id]/tickets.astro")
		expect(source).toContain('id="save-and-continue-btn"')
		expect(source).toContain("rows.some((row) => row.isActive)")
		expect(source).toContain("Selecciona al menos una categoría")
		expect(source).toContain("Promise.all([saveTickets(), saveCategories()])")
		expect(source).toContain('aria-label="Etiqueta del ticket ${index + 1}"')
	})

	it("preserves departure drafts and distinguishes templates from dates", () => {
		const editor = read("src/components/tours/TourSlotProfileEditor.astro")
		const page = read("src/pages/product/[id]/departures/new.astro")
		expect(editor).toContain("fastt:tour-departure-draft:")
		expect(editor).toContain("Tu borrador sigue guardado")
		expect(editor).toContain("plantilla de la salida")
		expect(editor).not.toContain("huésped")
		expect(page).toContain("Todavía no")
		expect(page).toContain("disponibilidad")
	})

	it("uses Tour-specific guided pricing while preserving shared rate management", () => {
		const source = read("src/pages/rates/plans/manage.astro")
		const tourSuccessBranch = source.slice(
			source.indexOf("if (tourLaunchPlaybookActive)"),
			source.indexOf(
				"window.location.href = `/rates/plans/${encodeURIComponent(result.ratePlanId)}`"
			)
		)
		expect(source).toContain('const isTourPlaybookRateStep = activePlaybook === "launch-tour"')
		expect(source).toContain('"Precio por participante"')
		expect(source).toContain('"Salida seleccionada"')
		expect(source).toContain("Condiciones de reserva")
		expect(source).toContain("ratePlanIntentPresets.filter")
		expect(tourSuccessBranch).toContain('step: "conditions"')
		expect(tourSuccessBranch).toContain('vista: "conditions"')
		expect(tourSuccessBranch).toContain(
			"window.location.href = `/rates/plans/${encodeURIComponent(String(result.ratePlanId))}"
		)
		expect(tourSuccessBranch).not.toContain("/rates/calendar")
	})

	it("treats launch-tour as guided future availability with capacity", () => {
		const page = read("src/pages/rates/calendar.astro")
		const workspace = read("src/components/rates/SingleCalendarWorkspace.tsx")
		expect(page).toContain('tourLaunchPlaybook.stepId === "calendar"')
		expect(page).toContain("gt(DailyInventory.date, todayIso)")
		expect(page).toContain("gt(DailyInventory.totalInventory, 0)")
		expect(page).toContain('activePlaybook === "launch-tour" ? 1 : 30')
		expect(workspace).toContain('guidedAvailability?.playbook === "launch-tour"')
		expect(workspace).toContain("La primera fecha reservable debe ser futura.")
		expect(workspace).toContain('"Cupo de participantes"')
	})
})
