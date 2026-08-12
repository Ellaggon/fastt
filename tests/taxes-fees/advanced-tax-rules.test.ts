import { describe, expect, it } from "vitest"

import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import type { ResolvedTaxFeeDefinition, TaxFeeDefinition } from "@/modules/taxes-fees/public"

function resolved(jurisdictionJson: unknown): ResolvedTaxFeeDefinition {
	const definition: TaxFeeDefinition = {
		id: "city-tax",
		providerId: "provider-1",
		code: "CITY_TAX",
		name: "Tasa municipal",
		kind: "tax",
		calculationType: "fixed",
		value: 10,
		currency: "USD",
		inclusionType: "excluded",
		appliesPer: "night",
		priority: 0,
		jurisdictionJson,
		effectiveFrom: null,
		effectiveTo: null,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	}
	return {
		definition,
		source: { scope: "product", scopeId: "product-1", definitionId: definition.id },
	}
}

describe("advanced tax fee rules", () => {
	it("applies jurisdiction, seasonal value, night cap and collection responsibility", () => {
		const result = computeTaxBreakdown({
			base: 300,
			definitions: [
				resolved({
					country: "CL",
					maxNights: 2,
					collectionResponsibility: "marketplace",
					seasons: [{ from: "2026-01-01", to: "2026-12-31", value: 12 }],
				}),
			],
			nights: 4,
			guests: 2,
			context: { country: "CL", checkIn: "2026-08-10" },
		})
		expect(result.total).toBe(324)
		expect(result.taxes.excluded[0]).toMatchObject({
			amount: 24,
			collectionResponsibility: "marketplace",
		})
	})

	it("skips a rule outside jurisdiction or for an exempt guest residence", () => {
		const definition = resolved({ country: "CL", exemptGuestResidenceCountries: ["AR"] })
		expect(
			computeTaxBreakdown({
				base: 100,
				definitions: [definition],
				nights: 1,
				guests: 1,
				context: { country: "AR", checkIn: "2026-08-10" },
			}).total
		).toBe(100)
		expect(
			computeTaxBreakdown({
				base: 100,
				definitions: [definition],
				nights: 1,
				guests: 1,
				context: { country: "CL", guestResidenceCountry: "AR", checkIn: "2026-08-10" },
			}).total
		).toBe(100)
	})

	it("uses included lines when the taxable base requires them", () => {
		const included = resolved({})
		included.definition.calculationType = "percentage"
		included.definition.value = 10
		included.definition.currency = null
		included.definition.inclusionType = "included"
		const cascading = resolved({ taxableBase: "base_plus_included" })
		cascading.definition.id = "service-tax"
		cascading.definition.code = "SERVICE_TAX"
		cascading.definition.calculationType = "percentage"
		cascading.definition.value = 10
		cascading.definition.currency = null
		expect(
			computeTaxBreakdown({ base: 100, definitions: [included, cascading], nights: 1, guests: 1 })
				.total
		).toBe(111)
	})
})
