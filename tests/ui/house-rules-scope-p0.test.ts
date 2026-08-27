import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/house-rules P0 alcance habitación", () => {
	it("anida habitaciones bajo el hotel en el switcher de house-rules", () => {
		const switcher = read("src/components/product/ProductContextSwitcher.astro")
		const shell = read("src/components/ui/ContextSwitcher.astro")

		expect(switcher).toContain('target === "house-rules"')
		expect(switcher).toContain("variantId")
		expect(switcher).toContain("Reglas del alojamiento")
		expect(switcher).toContain('heading: "Habitaciones"')
		expect(switcher).toContain("hotel_room")
		expect(switcher).toContain("Cambiar contexto")
		expect(switcher).toContain("meta:")
		expect(switcher).toContain('"Hereda todo"')
		expect(switcher).toContain('params.delete("variantId")')
		expect(shell).toContain("ContextSwitcherGroup")
		expect(shell).toContain("fastt-context-switcher__option--nested")
		expect(shell).toContain("data-context-switcher-group")
	})

	it("distingue coach de hotel y de espacio con editor de excepciones", () => {
		const page = read("src/pages/provider/house-rules.astro")

		expect(page).toContain("data-house-rules-scope={")
		expect(page).toContain('isRateContext ? "rate" : isSpaceContext ? "space" : "hotel"')
		expect(page).toContain("Este espacio")
		expect(page).toContain("Reglas del alojamiento")
		expect(page).toContain("Puedes definir excepciones puntuales abajo")
		expect(page).toContain("spaceOverrideCount")
		expect(page).toContain('params.delete("variantId")')
		expect(page).not.toContain("Cancellation")
		expect(page).not.toContain("NoShow")
	})

	it("muestra herencia de solo lectura en la ficha de habitación", () => {
		const room = read("src/pages/product/[id]/rooms/[roomId]/index.astro")
		const card = read("src/components/house-rules/RoomInheritedHouseRulesCard.astro")
		const rates = read("src/components/policy/RatePlanPoliciesSurface.astro")

		expect(room).toContain("RoomInheritedHouseRulesCard")
		expect(room).toContain("listEffectiveHouseRules")
		expect(room).toContain('rule.source === "override"')
		expect(room).toContain("overrideCount={spaceOverrideCount}")
		expect(card).toContain("data-room-house-rules-inheritance")
		expect(card).toContain("Expectativas de este espacio")
		expect(card).toContain("Aún no se personalizan por habitación")
		expect(card).toContain("Editar reglas")
		expect(room).toContain("variantId=${encodeURIComponent(roomId)}")
		expect(read("src/pages/product/[id]/rooms.astro")).toContain("Reglas para huéspedes")
		expect(rates).toContain("Editar en alojamiento")
	})
})

describe("ui/house-rules P0 guardrail comercial", () => {
	it("no mete tarifas comerciales en el switcher; solo excepciones de horario", () => {
		const switcher = read("src/components/product/ProductContextSwitcher.astro")

		expect(switcher).toContain('heading: "Habitaciones"')
		expect(switcher).toContain('heading: "Tarifas con horario distinto"')
		expect(switcher).toContain("listRatePlansWithArrivalException")
		expect(switcher).not.toContain("Cancellation")
		expect(switcher).not.toContain("NoShow")
		expect(switcher).not.toContain("Payment")
	})

	it("separa reglas de estadía y condiciones de tarifa en copy y destinos", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const rates = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const rateDetail = read("src/pages/rates/plans/[ratePlanId].astro")
		const types = read("src/modules/house-rules/presentation/houseRulePresentation.ts")
		const create = read("src/modules/house-rules/application/use-cases/create-house-rule.ts")

		expect(page).toContain("data-house-rules-commercial-boundary")
		expect(page).toContain("Cancelación, pago y no presentación no se editan aquí")
		expect(page).toContain("commercialConditionsHref")
		expect(page).toContain("routes.rates()")
		expect(page).not.toContain('data-assignment-category="Cancellation"')
		expect(page).not.toContain('data-assignment-category="Payment"')
		expect(page).not.toContain('data-assignment-category="NoShow"')

		expect(rates).toContain("data-rate-conditions-boundary")
		expect(rates).toContain("Mascotas, fumar y fiestas")
		expect(rates).toContain('data-assignment-category="Cancellation"')
		expect(rates).toContain('data-assignment-category="Payment"')
		expect(rates).toContain('data-assignment-category="NoShow"')
		expect(rates).not.toContain('data-assignment-category="CheckIn"')
		expect(rates).toContain("Excepción de esta tarifa")
		expect(rates).toContain("Editar en alojamiento")
		expect(rates).toContain("inlineHotelArrival")
		expect(rates).not.toContain("Pets")
		expect(rates).not.toContain("Smoking")
		expect(rates).not.toContain("Parties")

		expect(rateDetail).toContain("Cancelación, pago y no presentación de esta tarifa")
		expect(rateDetail).toContain("La llegada y salida se heredan del alojamiento")
		expect(rateDetail).toContain("inlineHotelArrival={isPlaybookMode}")

		for (const commercial of ["Cancellation", "Payment", "NoShow"]) {
			expect(types).not.toContain(`"${commercial}"`)
			expect(create).not.toContain(`"${commercial}"`)
		}
	})
})
