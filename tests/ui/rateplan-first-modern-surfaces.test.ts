import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan-first modern surfaces", () => {
	it("pricing page moderna pasa solo ratePlanId al surface", () => {
		const source = read("src/pages/rates/plans/[ratePlanId]/pricing.astro")
		expect(source).toContain("<RatePlanPricingSurface")
		expect(source).toContain("ratePlanId={ownerContext.ratePlanId}")
		expect(source).not.toContain("variantId={ownerContext.variantId}")
	})

	it("pricing surface moderna envía solo ratePlanId", () => {
		const source = read("src/components/pricing/RatePlanPricingSurface.astro")
		expect(source).toContain('<Input type="hidden" name="ratePlanId" value={ratePlanId} />')
		expect(source).not.toContain('name="variantId"')
	})

	it("policies page moderna no inyecta variantId en el use-case POST", () => {
		const source = read("src/pages/rates/plans/[ratePlanId]/policies.astro")
		expect(source).toContain("handleRatePlanPoliciesPost({")
		expect(source).toContain("ratePlans: selectedRatePlans")
		expect(source).not.toContain("expectedOwnerContext")
		expect(source).not.toContain("variantId: ownerContext.variantId")
	})

	it("wizard de policies envía solo ratePlanId en preview/save_category", () => {
		const source = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const previewBlockMatch = source.match(/intent:\s*"preview"[\s\S]*?}\),\s*\n\t\t}\)/)
		const saveBlockMatch = source.match(/intent:\s*"save_category"[\s\S]*?}\),\s*\n\t\t}\)/)

		expect(previewBlockMatch?.[0]).toContain("ratePlanId: state.plan.ratePlanId")
		expect(previewBlockMatch?.[0]).not.toContain("variantId:")
		expect(previewBlockMatch?.[0]).not.toContain("productId:")

		expect(saveBlockMatch?.[0]).toContain("ratePlanId: state.plan.ratePlanId")
		expect(saveBlockMatch?.[0]).not.toContain("variantId:")
		expect(saveBlockMatch?.[0]).not.toContain("productId:")
	})

	it("no existen superficies legacy variant-first de pricing", () => {
		const pages = [
			"src/pages/product/[id]/variants/[variantId]/pricing/index.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/calendar.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/seasons.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/promotions.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/overrides.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/rateplans.astro",
		]
		for (const page of pages) {
			expect(existsSync(resolve(process.cwd(), page))).toBe(false)
		}
	})
})
