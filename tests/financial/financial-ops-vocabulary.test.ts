import { describe, expect, it } from "vitest"

import { buildFinancialHumanContext } from "@/pages/financial/_client/financial-human-display"
import {
	normalizeItemVertical,
	resolveFinancialPresentationFromContext,
} from "@/pages/financial/_client/financial-ops-vocabulary"

describe("financial-ops-vocabulary", () => {
	it("uses tour ops copy for tour scope", () => {
		const copy = resolveFinancialPresentationFromContext({
			vertical: "tour",
			scopeProduct: "Tour",
			productPlural: "tours",
		})
		expect(copy.scopeProduct).toBe("Tour")
		expect(copy.stayGuestLabel).toBe("Salida y participante")
		expect(copy.evidenceSearchPlaceholder).toContain("participante")
		expect(copy.workspaceSearchPlaceholder).toContain("tours")
	})

	it("uses hotel ops copy for hotel scope", () => {
		const copy = resolveFinancialPresentationFromContext({
			vertical: "hotel",
		})
		expect(copy.scopeProduct).toBe("Alojamiento")
		expect(copy.stayGuestLabel).toBe("Estancia y huésped")
		expect(copy.ops.searchPlaceholder).toBe("Buscar huésped o reserva")
	})

	it("maps an item's vertical or commercial line so rows in a mixed scope keep their own wording", () => {
		expect(normalizeItemVertical("tour")).toBe("tour")
		expect(normalizeItemVertical("Tour")).toBe("tour")
		expect(normalizeItemVertical("lodging")).toBe("hotel")
		expect(normalizeItemVertical("hotel")).toBe("hotel")
		expect(normalizeItemVertical("")).toBeNull()
		expect(normalizeItemVertical(undefined)).toBeNull()
		expect(normalizeItemVertical("something_else")).toBeNull()
	})

	it("builds the booking's own vocabulary from the item context", () => {
		const context = buildFinancialHumanContext({
			bookingId: "b1",
			operation: { contract: { vertical: "tour", commercialLine: "tour" } },
		})
		expect(context.vertical).toBe("tour")
		expect(buildFinancialHumanContext({ bookingId: "b2", commercialLine: "lodging" }).vertical).toBe(
			"hotel"
		)
	})
})
