import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("tour commercial wizard", () => {
	it("separates participant definitions from public discovery categories", () => {
		const participants = read("src/pages/product/[id]/tickets.astro")
		const categories = read("src/pages/product/[id]/categories.astro")
		expect(participants).toContain(
			'continueFormId={playbook.active ? "ticketsPlaybookForm" : null}'
		)
		expect(participants).toContain("rows.some((row) => row.isActive)")
		expect(participants).toContain('aria-label="Nombre visible de la entrada ${index + 1}"')
		expect(participants).toContain("categoriesHref")
		expect(participants).not.toContain("ProductCategoryLink")
		expect(categories).toContain("publicTourCategories")
		expect(categories).toContain("Selecciona una categoría")
		expect(categories).toContain('eq(ProductCategory.isActive, true)')
		expect(categories).toContain('eq(ProductCategory.dataClass, "production")')
		expect(categories).toContain("representan tipos de")
	})

	it("preserves departure drafts and distinguishes templates from dates", () => {
		const editor = read("src/components/tours/TourSlotProfileEditor.astro")
		const page = read("src/pages/product/[id]/departures/new.astro")
		expect(editor).toContain("fastt:tour-departure-draft:")
		expect(editor).toContain("Tu borrador sigue guardado")
		expect(editor).toMatch(/Compartido\s+\(reserva directa con cupo común\)/)
		expect(editor).toMatch(/Privado\s+\(solicitud de cotización\)/)
		expect(editor).toMatch(/Las categorías de participantes comparten este mismo cupo/)
		expect(editor).not.toContain("huésped")
		expect(page).toContain("Define hora, cupo, idioma y modalidad")
		expect(page).toContain("pasos siguientes")
	})
})
