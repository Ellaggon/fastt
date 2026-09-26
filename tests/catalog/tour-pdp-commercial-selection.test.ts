import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve("src/components/tours/TourDepartureSection.astro"), "utf8")

describe("tour PDP commercial selection", () => {
	it("uses a declared sequence from search to selection and a held total", () => {
		expect(source).toContain("1.</span>Fecha y grupo")
		expect(source).toContain("2.</span>Elige una opción")
		expect(source).toContain("3.</span>Revisa y reserva")
		expect(source).toContain("Total confirmado:")
		expect(source).toContain("El total contractual y cargos se fijan al reservar cupo.")
	})

	it("invalidates all commercial state before results can be reused", () => {
		expect(source).toContain('root.dataset.selectionState = "stale"')
		expect(source).toContain("setOfferActionsDisabled(true)")
		expect(source).toContain('latestHoldId = ""')
		expect(source).toContain('latestPriceQuoteId = ""')
		expect(source).toContain("Hay cambios sin consultar")
	})

	it("keeps mobile access informational and non-transactional", () => {
		expect(source).toContain("data-mobile-booking-cta")
		expect(source).toContain('aria-controls="booking"')
		expect(source).toContain("root.scrollIntoView")
		expect(source).not.toContain("data-mobile-booking-cta\n\t\t\t\t\tdata-reserve")
	})
})
