import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { resolveCommercialIntentSpec } from "@/lib/rates/ratePlanCommercialIntent"

function source(path: string) {
	return readFileSync(resolve(path), "utf8")
}

describe("tour commercial rate context", () => {
	it("keeps product type and guided context across rate, conditions and calendar", () => {
		const variants = source("src/lib/rates/loadProviderRatePlanVariants.ts")
		const manage = source("src/pages/rates/plans/manage.astro")
		const detail = source("src/pages/rates/plans/[ratePlanId].astro")
		const calendar = source("src/pages/rates/calendar.astro")

		expect(variants).toContain("productType: Product.productType")
		expect(manage).toContain("resolveCompleteToPublishPlaybookFromUrl")
		expect(manage).toContain('activePlaybook === "complete-to-publish"')
		expect(manage).toContain('step: "bookingPolicies"')
		expect(manage).toContain('"Precio por participante"')
		expect(detail).toContain("completeContinueHref")
		expect(detail).toContain("isPlaybookMode && isTourContext")
		expect(calendar).toContain('completePlaybook.stepId === "calendar"')
		expect(calendar).toContain('vertical: isTourContext ? "tour" : "hotel"')
	})

	it("keeps lodging and tour vocabulary separate on shared rate components", () => {
		const pricing = source("src/components/pricing/RatePlanPricingSurface.astro")
		const policies = source("src/components/policy/RatePlanPoliciesSurface.astro")
		const table = source("src/components/rates/RatePlanResponsiveTable.astro")
		const createEndpoint = source("src/pages/api/rateplans/create.ts")

		expect(pricing).toContain('offeringType?: "accommodation" | "tour"')
		expect(pricing).toContain('isTour ? "Precio por participante" : "Precio base por noche"')
		expect(policies).toContain('isTour ? "Presentación para la salida" : "Llegada y salida"')
		expect(table).toContain("row.priceUnitLabel")
		expect(createEndpoint).not.toContain('error: "Habitación no encontrada."')
	})

	it("never creates a tour contract that promises platform prepayment", () => {
		const hotel = resolveCommercialIntentSpec("non_refundable")
		const tour = resolveCommercialIntentSpec("non_refundable", { offeringType: "tour" })

		expect(hotel.contract.Payment).toBe("prepayment_full")
		expect(tour.contract.Payment).toBe("pay_at_property")
		expect(tour.contract.NoShow).toBe("no_show_percentage_100")
		const manage = source("src/pages/rates/plans/manage.astro")
		expect(manage).toContain('["flexible", "early_booking"]')
	})

	it("uses tour-specific guided pricing while preserving shared rate management", () => {
		const source = (path: string) => readFileSync(resolve(path), "utf8")
		const manage = source("src/pages/rates/plans/manage.astro")
		const tourSuccessBranch = manage.slice(
			manage.indexOf("if (tourLaunchPlaybookActive)"),
			manage.indexOf("if (completePlaybookActive)")
		)
		expect(manage).toContain(
			"const isTourPlaybookRateStep = Boolean(activePlaybook && isTourRateContext)"
		)
		expect(manage).toContain('"Precio por participante"')
		expect(manage).toContain('"Salida seleccionada"')
		expect(manage).toContain("Condiciones de reserva")
		expect(manage).toContain("ratePlanIntentPresets.filter")
		expect(tourSuccessBranch).toContain('step: "conditions"')
		expect(tourSuccessBranch).toContain('vista: "conditions"')
		expect(tourSuccessBranch).toContain(
			"window.location.href = `/rates/plans/${encodeURIComponent(String(result.ratePlanId))}"
		)
		expect(tourSuccessBranch).not.toContain("/rates/calendar")
	})

	it("treats launch-tour as guided future availability with capacity", () => {
		const source = (path: string) => readFileSync(resolve(path), "utf8")
		const page = source("src/pages/rates/calendar.astro")
		const workspace = source("src/components/rates/SingleCalendarWorkspace.tsx")
		expect(page).toContain('tourLaunchPlaybook.stepId === "calendar"')
		expect(page).toContain("gt(DailyInventory.date, todayIso)")
		expect(page).toContain("gt(DailyInventory.totalInventory, 0)")
		expect(page).toContain("requiredDays: isTourContext ? 1 : 30")
		expect(workspace).toContain('guidedAvailability?.vertical === "tour"')
		expect(workspace).toContain("La primera fecha reservable debe ser futura.")
		expect(workspace).toContain('"Cupo de participantes"')
	})

	it("requires availability before activating the guided tour rate", () => {
		const calendar = source("src/components/rates/SingleCalendarWorkspace.tsx")
		const page = source("src/pages/rates/calendar.astro")
		const endpoint = source("src/pages/api/rateplans/activate-guided.ts")
		const validator = source("src/lib/rates/validateRatePlanPublication.ts")
		const finalizer = source("src/lib/playbook/finalize-tour-rate.ts")

		expect(calendar).toContain("Activar tarifa y continuar")
		expect(calendar).toContain("finalizeGuidedRate")
		expect(page).toContain("hideFooter: isTourContext")
		expect(endpoint).toContain("finalizeTourRate")
		expect(validator).toContain("const minimumAvailabilityDays = isTour ? 1")
		expect(finalizer).toContain("isActive: true")
		expect(finalizer).toContain("validateRatePlanPublication")
	})
})
