import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/house-rules P2 rate arrival scope", () => {
	it("lists only rate plans with CheckIn exception in the house-rules switcher", () => {
		const switcher = read("src/components/product/ProductContextSwitcher.astro")

		expect(switcher).toContain("listRatePlansWithArrivalException")
		expect(switcher).toContain('heading: "Tarifas con horario distinto"')
		expect(switcher).toContain("houseRulesRateHref")
		expect(switcher).toContain("params.set(\"ratePlanId\"")
		expect(switcher).toContain("params.delete(\"ratePlanId\")")
		expect(switcher).not.toContain("Cancellation")
		expect(switcher).not.toContain("Payment")
		expect(switcher).not.toContain("NoShow")
	})

	it("edits only arrival/departure on ?ratePlanId= via PolicyAssignment rate_plan", () => {
		const page = read("src/pages/provider/house-rules.astro")
		const panel = read("src/components/house-rules/RatePlanArrivalExceptionPanel.astro")
		const lib = read("src/lib/policies/ratePlanArrivalException.ts")

		expect(page).toContain("RatePlanArrivalExceptionPanel")
		expect(page).toContain('data-house-rules-scope={')
		expect(page).toContain('"rate"')
		expect(page).toContain("upsert-rate-arrival-exception")
		expect(page).toContain("remove-rate-arrival-exception")
		expect(page).toContain("getRatePlanArrivalContext")
		expect(page).toContain("upsertRatePlanArrivalException")
		expect(panel).toContain("data-house-rules-rate-arrival")
		expect(panel).toContain("Quitar excepción")
		expect(panel).toContain("Crear excepción de horario")
		expect(panel).toContain("Solo el horario de esta tarifa")
		expect(lib).toContain('scope: "rate_plan"')
		expect(lib).toContain('category: "CheckIn"')
		expect(lib).toContain("replacePolicyAssignmentCapa6")
		expect(lib).toContain("deactivatePolicyAssignmentCapa6")
		expect(lib).toContain("listRatePlansWithArrivalException")
	})

	it("offers rate schedule exception CTA from Condiciones without opening pets/smoking", () => {
		const rates = read("src/components/policy/RatePlanPoliciesSurface.astro")

		expect(rates).toContain("Excepción de esta tarifa")
		expect(rates).toContain('mode === "rate-exception"')
		expect(rates).toContain("data-rate-arrival-exception-cta")
		expect(rates).toContain("Editar en alojamiento")
		expect(rates).not.toContain("Pets")
		expect(rates).not.toContain("Smoking")
		expect(rates).not.toContain("Parties")
	})
})
