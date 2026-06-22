import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan hardening post-migration (modern)", () => {
	it("mantiene flujo moderno de tarifas sin hub visible duplicado", () => {
		const manage = read("src/pages/rates/plans/manage.astro")
		const hubDetail = read("src/pages/rates/plans/[ratePlanId].astro")

		expect(existsSync(resolve(process.cwd(), "src/pages/rates/plans/index.astro"))).toBe(false)
		expect(manage).toContain("loadRatePlansReadModel")
		expect(manage).toContain("routes.ratePlanPolicies")
		expect(manage).not.toContain("routes.ratePlanPricing")
		expect(manage).toContain("ratePlanId")
		expect(hubDetail).toContain("ratePlanId")
		expect(hubDetail).toContain("loadRatePlanReadModelById")
		expect(hubDetail).toContain("<RatePlanPricingSurface")
	})

	it("superficies modernas operan en contexto ratePlan-first", () => {
		const pricingSurface = read("src/components/pricing/RatePlanPricingSurface.astro")
		const ratePlanSurface = read("src/pages/rates/plans/[ratePlanId].astro")
		const pricingSubnav = read("src/components/pricing/PricingSubnav.astro")

		expect(pricingSurface).toContain("ratePlanId")
		expect(ratePlanSurface).toContain("RatePlanPoliciesSurface")
		expect(ratePlanSurface).toContain('data-rate-plan-panel="conditions"')
		expect(pricingSubnav).not.toContain("routes.variantPricing(")
		expect(pricingSubnav).not.toContain("routes.variantPricingCalendar(")
		expect(pricingSubnav).not.toContain("routes.variantPricingSeasons(")
		expect(pricingSubnav).not.toContain("routes.variantPricingPromotions(")
		expect(pricingSubnav).not.toContain("routes.variantPricingOverrides(")
	})
})
