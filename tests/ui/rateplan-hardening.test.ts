import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan hardening post-migration", () => {
	it("rutas variant-first de pricing redirigen al hub ratePlan-first", () => {
		const files = [
			"src/pages/product/[id]/variants/[variantId]/pricing/index.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/calendar.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/seasons.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/promotions.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/overrides.astro",
		]
		for (const file of files) {
			const source = read(file)
			expect(source).toContain("Astro.redirect")
			expect(source).toContain("routes.ratePlanPricing")
			expect(source).toContain("routes.ratePlansHub")
		}
	})

	it("onboarding pricing crea/usa ratePlanId y no envía variantId al endpoint de base rate", () => {
		const source = read("src/pages/product/[id]/variants/new.astro")
		expect(source).toContain('fetch("/api/rateplans/create"')
		expect(source).toContain('fd.set("ratePlanId", selectedRatePlanId)')
		expect(source).toContain('fd.delete("variantId")')
	})
})
