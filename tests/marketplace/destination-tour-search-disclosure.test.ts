import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("destination tour search disclosure", () => {
	it("keeps a selected tour destination compact until the traveler chooses to edit it", () => {
		const results = read("src/components/marketplace/MarketplaceDestinationResults.astro")

		expect(results).toContain("compact={Boolean(destination)}")
		expect(results).not.toContain('"Destino seleccionado"')
		expect(results).not.toContain("Ajusta fecha o filtros cuando quieras.")
		expect(results).not.toContain("Todos los tours")
	})

	it("marks Tours active in the main nav on destination tour listings", () => {
		const nav = read("src/components/nav/NavLayout.astro")

		expect(nav).toContain('isDestinationVertical("tours")')
		expect(nav).toContain('isDestinationVertical("alojamientos")')
	})

	it("uses one complete search form for compact and expanded contexts", () => {
		const panel = read("src/components/searchPanel/TourSearchPanel.astro")

		expect(panel).toContain("compact?: boolean")
		expect(panel).toContain("<TourSearchDisclosure")
		expect(panel).toContain("compact={compact}")
		expect(panel).toContain("activeFilterCount={activeFilterLabels.length}")
		expect(panel).toContain('id="tourSearchFilters"')
		expect(panel).toContain('name="priceMin"')
		expect(panel).toContain('name="priceMax"')
		expect(panel).toContain('name="sort"')
	})

	it("pairs summary chips with animated form fields in compact mode", () => {
		const panel = read("src/components/searchPanel/TourSearchPanel.astro")

		expect(panel).toContain("max-md:grid-cols-2")
		expect(panel).toContain('max-md:col-span-2" data-search-field="destination"')
		expect(panel).toContain('data-search-field="date"')
		expect(panel).toContain('data-search-field="filters"')
		expect(panel).toContain("tour-search-filters-control")
		expect(panel).toContain('data-search-field="submit"')
		expect(panel).toContain('compact\n\t\t\t? "w-full"')
		expect(panel).toContain("Fecha de salida")
		expect(panel).not.toContain("Fecha de salida (opcional)")
		expect(panel).toContain('variant="secondary"')
		expect(panel).toContain('aria-label="Filtros"')
		expect(panel).toContain("tour-search-submit")
		expect(panel).toContain('type="submit"')
		expect(panel).toContain('variant="primary"')
		expect(panel).toContain(">Buscar<")
		expect(panel).toContain('aria-label="Buscar tours"')
	})

	it("summarizes destination, departure and optional filters without empty-state noise", () => {
		const disclosure = read("src/components/searchPanel/TourSearchDisclosure.astro")

		expect(disclosure).toContain('data-search-origin="destination"')
		expect(disclosure).toContain('data-search-origin="date"')
		expect(disclosure).toContain('data-search-origin="filters"')
		expect(disclosure).toContain("tour-search-disclosure__summary-leading")
		expect(disclosure).toContain("tour-search-disclosure__filters-label")
		expect(disclosure).toContain("hidden md:inline-block")
		expect(disclosure).not.toContain("data-search-origin-filters-mobile")
		expect(disclosure).toContain("es-BO")
		expect(disclosure).toContain("filterLabel ?")
		expect(disclosure).not.toContain('"Sin filtros"')
		expect(disclosure).toContain("summaryAriaLabel")
	})

	it("expands and collapses with height FLIP, field motion, and reduced-motion fallback", () => {
		const disclosure = read("src/components/searchPanel/TourSearchDisclosure.astro")

		expect(disclosure).toContain("<details")
		expect(disclosure).toContain("Modificar búsqueda")
		expect(disclosure).toContain("Cerrar búsqueda")
		expect(disclosure).toContain('data-tour-search-disclosure-content')
		expect(disclosure).toContain('data-search-collapse')
		expect(disclosure).toContain("Contraer")
		expect(disclosure).toContain('dataset.expanded')
		expect(disclosure).toContain("summary.inert = expanded")
		expect(disclosure).toContain('[data-search-field]')
		expect(disclosure).toContain('[data-search-origin')
		expect(disclosure).toContain("root.animate")
		expect(disclosure).toContain("field.animate")
		expect(disclosure).toContain("prefers-reduced-motion")
		expect(disclosure).toContain("Cerrar formulario de búsqueda")
		expect(disclosure).toContain("collapseSearch")
		expect(disclosure).toContain("setSearchExpanded")
	})

	it("animates the advanced filters panel with staged sections and activity chips", () => {
		const panel = read("src/components/searchPanel/TourSearchPanel.astro")

		expect(panel).toContain("data-tour-filters-section")
		expect(panel).toContain("data-tour-filters-chip")
		expect(panel).toContain("runFiltersPanelMotion")
		expect(panel).toContain("is-filter-panel-open")
		expect(panel).toContain("tour-search-filters-panel")
	})

	it("keeps autocomplete usable while the panel height animates", () => {
		const disclosure = read("src/components/searchPanel/TourSearchDisclosure.astro")

		expect(disclosure).toContain('content.style.overflow = "visible"')
		expect(disclosure).toContain("natural height and visible overflow afterwards for autocomplete")
	})
})
