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
		expect(panel).toContain("value={option.value}")
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
		const search = read("src/pages/buscar/tours.astro")
		expect(search).toContain('availability === "disabled"')
		expect(search).toContain("Búsqueda de experiencias no disponible")
		expect(search).toContain("La reserva pública de experiencias no está abierta en este momento.")
		expect(search).toContain("Sin disponibilidad para estos filtros")
		expect(search).toContain("No encontramos experiencias con estos filtros")
		expect(search).toContain("Selecciona una fecha")
		expect(search).not.toContain("<code>tour_slot</code>")
	})

	it("PDP hold/confirm explain tours_checkout_disabled", () => {
		const booking = read("src/components/tours/TourDepartureSection.astro")
		expect(booking).toContain('payload?.error === "tours_checkout_disabled"')
		expect(booking).toContain("Las reservas no están disponibles ahora. Intenta más tarde.")
	})

	it("private-request inbox can accept or decline via transition API", () => {
		const page = read("src/components/booking/PrivateRequestDetail.astro")
		expect(page).toContain("/api/tours/private-request/transition")
		expect(page).toContain('value="accepted"')
		expect(page).toContain('value="declined"')
		expect(page).toContain("providerNote")
		expect(page).toContain("Aceptar")
		expect(page).toContain("Rechazar")
	})

	it("provider subtype stores difficulty via canonical select", () => {
		const subtype = read("src/pages/product/[id]/subtype.astro")
		const fields = read("src/components/tours/TourSubtypePlaybookFields.astro")
		expect(subtype).toContain("TourSubtypePlaybookFields")
		expect(fields).toContain("TOUR_DIFFICULTY_OPTIONS")
		expect(fields).toContain('name="difficultyLevel"')
		expect(fields).toContain("normalizeTourDifficulty")
		expect(fields).not.toContain('placeholder="Fácil, Moderado, Difícil..."')
	})
})
