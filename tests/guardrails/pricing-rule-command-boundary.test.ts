import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("pricing rule command boundary", () => {
	it("keeps HTTP outside the command service", () => {
		const service = read(
			"src/modules/pricing/application/use-cases/pricing-rule-command-service.ts"
		)
		for (const forbidden of ["APIRoute", "Request", "Response", "FormData", "cookie"]) {
			expect(service).not.toContain(forbidden)
		}
		expect(service).toContain("previewCandidate(")
		expect(service).toContain("createRule(")
		expect(service).toContain("rematerialize(input:")
		expect(service).toContain("invalidatePricingBatch(input:")
		expect(service).toContain("enqueueAri(input:")
	})

	it("keeps endpoints as adapters and bulk independent from Astro pages", () => {
		const preview = read("src/pages/api/pricing/rules/v2/preview.ts")
		const create = read("src/pages/api/pricing/rules/v2/create.ts")
		const bulk = read("src/modules/pricing/application/use-cases/bulk-pricing-service.ts")

		expect(preview).toContain("pricingRuleCommandService.previewCandidate")
		expect(create).toContain("pricingRuleCommandService.createRule")
		expect(preview).not.toContain("evaluatePricingRules")
		expect(create).not.toContain("createCommercialPriceRule")
		expect(bulk).not.toContain("@/pages/api/pricing/rules/v2/")
		expect(bulk).not.toMatch(/\bRequest\b/)
		expect(bulk).not.toContain("getUserFromRequest")
		expect(bulk).not.toContain("getProviderIdFromRequest")
	})
})
