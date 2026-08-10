import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(rel: string) {
	return readFileSync(resolve(rel), "utf8")
}

describe("tours P0A broken-flow remediations", () => {
	it("search panel submits canonical difficulty values with Spanish labels", () => {
		const panel = read("src/components/searchPanel/TourSearchPanel.astro")
		expect(panel).toContain("TOUR_DIFFICULTY_OPTIONS")
		expect(panel).toContain("value={level.value}")
		expect(panel).not.toContain('const levels = ["Fácil", "Moderado", "Difícil"]')
	})

	it("search surface normalizes level and exposes availability states", () => {
		const surface = read("src/lib/tours/tourSearchSurface.ts")
		expect(surface).toContain("normalizeTourDifficulty")
		expect(surface).toContain("tourDifficultyMatchValues")
		expect(surface).toContain('availability: outcome === "disabled" ? "disabled" : "empty"')
		expect(surface).toContain('availability: "error"')
		expect(surface).toContain('availability: sliced.length === 0 ? "empty" : "ready"')
	})

	it("search page distinguishes rollout off from commercial empty", () => {
		const search = read("src/pages/tours/search.astro")
		expect(search).toContain('availability === "disabled"')
		expect(search).toContain("Búsqueda de tours temporalmente no disponible")
		expect(search).toContain("Sin salidas para estos filtros")
		expect(search).toContain("No hay salidas disponibles")
		expect(search).not.toContain("<code>tour_slot</code>")
	})

	it("PDP hold/confirm explain tours_checkout_disabled", () => {
		const booking = read("src/components/tours/TourDepartureSection.astro")
		expect(booking).toContain('payload?.error === "tours_checkout_disabled"')
		expect(booking).toContain("La reserva de tours no está disponible ahora (rollout)")
	})

	it("private-request inbox can accept or decline via transition API", () => {
		const page = read("src/pages/product/[id]/private-requests.astro")
		expect(page).toContain("/api/tours/private-request/transition")
		expect(page).toContain('data-transition="accepted"')
		expect(page).toContain('data-transition="declined"')
		expect(page).toContain("providerNote")
		expect(page).toContain("Aceptar")
		expect(page).toContain("Rechazar")
	})

	it("provider subtype stores difficulty via canonical select", () => {
		const subtype = read("src/pages/product/[id]/subtype.astro")
		expect(subtype).toContain("TOUR_DIFFICULTY_OPTIONS")
		expect(subtype).toContain('name="difficultyLevel"')
		expect(subtype).toContain("normalizeTourDifficulty")
		expect(subtype).not.toContain('placeholder="Fácil, Moderado, Difícil..."')
	})
})
