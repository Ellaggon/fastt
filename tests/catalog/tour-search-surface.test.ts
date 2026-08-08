import { describe, expect, it } from "vitest"
import { TOUR_DISCOVERY_OCCUPANCY } from "@/lib/tours/tourSearchSurface"
import { buildOccupancyKey } from "@/modules/search/public"
import { getVerticalVocabulary } from "@/lib/verticalVocabulary"

describe("tour search surface (P1 discovery)", () => {
	it("uses a1c0i0 occupancy for marketplace from-price", () => {
		expect(buildOccupancyKey(TOUR_DISCOVERY_OCCUPANCY)).toBe("a1_c0_i0")
	})

	it("exposes vertical card vocabulary for tours vs hotels", () => {
		expect(getVerticalVocabulary("tour").card.viewCta).toBe("Ver tour")
		expect(getVerticalVocabulary("tour").card.priceUnitLabel).toMatch(/participante/i)
		expect(getVerticalVocabulary("hotel").card.viewCta).toBe("Ver hotel")
		expect(getVerticalVocabulary("hotel").card.priceUnitLabel).toMatch(/noche/i)
	})
})
