import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const LEGACY_VARIANT_PRICING_PAGES = [
	"src/pages/product/[id]/variants/[variantId]/pricing/index.astro",
	"src/pages/product/[id]/variants/[variantId]/pricing/calendar.astro",
	"src/pages/product/[id]/variants/[variantId]/pricing/seasons.astro",
	"src/pages/product/[id]/variants/[variantId]/pricing/promotions.astro",
	"src/pages/product/[id]/variants/[variantId]/pricing/overrides.astro",
	"src/pages/product/[id]/variants/[variantId]/pricing/rateplans.astro",
]

describe("Guardrail: no variant-pricing UI surfaces", () => {
	it("removes legacy variant pricing pages from router", () => {
		const existing = LEGACY_VARIANT_PRICING_PAGES.filter((page) =>
			existsSync(resolve(process.cwd(), page))
		)
		expect(
			existing,
			`Legacy variant-pricing pages must not exist:\n${existing.join("\n")}`
		).toEqual([])
	})

	it("prevents reintroduction of variant-pricing route helpers in routes.ts", () => {
		const routesSource = readFileSync(join(process.cwd(), "src/lib/routes.ts"), "utf8")
		expect(routesSource).not.toMatch(/variantPricing/i)
		expect(routesSource).not.toMatch(/variants\/.+pricing/i)
	})

	it("keeps pricing subnav strictly ratePlan-first", () => {
		const subnavSource = readFileSync(
			join(process.cwd(), "src/components/pricing/PricingSubnav.astro"),
			"utf8"
		)
		expect(subnavSource).not.toMatch(/routes\.variantPricing/i)
		expect(subnavSource).not.toMatch(/\/variants\/\[variantId\]\/pricing/i)
		expect(subnavSource).not.toContain("routes.ratePlansHub()")
		expect(subnavSource).toContain("routes.ratePlansList()")
	})
})
