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
		const presentation = read("src/components/tours/TourPresentationForm.astro")
		const presentationLoader = read("src/lib/tours/loadTourPresentationForm.ts")
		const categoryChoices = read("src/components/tours/TourCategoryChoices.astro")
		expect(participants).toContain(
			'continueFormId={playbook.active ? "ticketsPlaybookForm" : null}'
		)
		expect(participants).toContain("rows.some((row) => row.isActive)")
		expect(participants).toContain('aria-label="Nombre visible de la entrada ${index + 1}"')
		expect(participants).toContain("categoriesHref")
		expect(participants).not.toContain("ProductCategoryLink")
		// Categories live in presentation; /categories is only a compatibility redirect.
		expect(categories).toContain("tourPresentationCanonicalHref")
		expect(categories).toContain("Compatibility entry")
		expect(categories).not.toContain("publicTourCategories")
		expect(categories).not.toContain("ProductCategoryLink")
		expect(presentation).toContain("TourCategoryChoices")
		expect(categoryChoices).toContain('name="categoryId"')
		expect(categoryChoices).toContain("¿Qué tipo de experiencia ofreces?")
		expect(presentationLoader).toContain("publicTourCategories")
		expect(presentationLoader).toContain('eq(ProductCategory.isActive, true)')
		expect(presentationLoader).toContain('eq(ProductCategory.dataClass, "production")')
	})

	it("preserves departure drafts and distinguishes templates from dates", () => {
		const editor = read("src/components/tours/TourSlotProfileEditor.astro")
		const page = read("src/pages/product/[id]/departures/new.astro")
		expect(editor).toContain("fastt:tour-departure-draft:")
		expect(editor).toContain("Tu borrador sigue guardado")
		expect(editor).toMatch(/Compartido\s+\(reserva directa con cupo común\)/)
		expect(editor).toMatch(/Privado\s+\(solicitud de cotización\)/)
		expect(editor).toContain("FieldHelp")
		expect(editor).toContain("suman al mismo cupo")
		expect(editor).toContain("Ayuda sobre modalidad")
		expect(editor).not.toContain("huésped")
		expect(page).toContain("Define hora, cupo, idioma y modalidad")
		expect(page).toContain("pasos siguientes")
	})
})
