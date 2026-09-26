import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve("src/pages/tours/[id]/index.astro"), "utf8")
const booking = readFileSync(resolve("src/components/tours/TourDepartureSection.astro"), "utf8")

describe("tour PDP content architecture", () => {
	it("keeps stable tour content separate from the commercial rail", () => {
		expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_22rem]")
		expect(source).toContain('layout="rail"')
		expect(source).toContain('class="lg:sticky lg:top-6')
		expect(booking).toContain('layout = "default"')
		expect(booking).toContain('isRail ? "grid-cols-1"')
	})

	it("renders one readable duration and no empty map substitute", () => {
		expect(source).toContain("formatTourDuration")
		expect(source).toContain("{durationLabel}")
		expect(source).not.toContain("durationMinutes} min")
		expect(source).not.toContain("Coordenadas no publicadas todavía")
	})

	it("consolidates logistics and avoids repeating it in pre-booking requirements", () => {
		expect(source).toContain("Encuentro y recogida")
		expect(source).toContain("Abrir ubicación en el mapa")
		const requirements = source.slice(
			source.indexOf("const beforeYouBook"),
			source.indexOf("const durationLabel")
		)
		expect(requirements).not.toContain("pickupInstructions")
		expect(requirements).not.toContain("meetingInstructions")
		expect(source).not.toContain("Punto de encuentro y pickup")
	})
})
