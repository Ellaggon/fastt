import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan hardening post-migration (modern)", () => {
	it("mantiene flujo moderno /rates/plans como hub operativo", () => {
		const hubIndex = read("src/pages/rates/plans/index.astro")
		const hubDetail = read("src/pages/rates/plans/[ratePlanId].astro")

		expect(hubIndex).toContain("loadRatePlansReadModel")
		expect(hubIndex).toContain("routes.ratePlanPolicies")
		expect(hubIndex).toContain("routes.ratePlanPricing")
		expect(hubIndex).toContain("ratePlanId")
		expect(hubDetail).toContain("ratePlanId")
		expect(hubDetail).toContain("loadRatePlanReadModelById")
	})

	it("superficies modernas operan en contexto ratePlan-first", () => {
		const pricingSurface = read("src/pages/rates/plans/[ratePlanId]/pricing.astro")
		const policiesSurface = read("src/pages/rates/plans/[ratePlanId]/policies.astro")
		const pricingSubnav = read("src/components/pricing/PricingSubnav.astro")

		expect(pricingSurface).toContain("ratePlanId")
		expect(policiesSurface).toContain("ratePlanId")
		expect(pricingSubnav).not.toContain("routes.variantPricing(")
		expect(pricingSubnav).not.toContain("routes.variantPricingCalendar(")
		expect(pricingSubnav).not.toContain("routes.variantPricingSeasons(")
		expect(pricingSubnav).not.toContain("routes.variantPricingPromotions(")
		expect(pricingSubnav).not.toContain("routes.variantPricingOverrides(")
	})
})
