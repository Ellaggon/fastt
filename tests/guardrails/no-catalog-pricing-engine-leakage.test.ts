import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const CATALOG_FILES = [
	"src/modules/catalog/infrastructure/repositories/CatalogReadModelRepository.ts",
	"src/modules/catalog/infrastructure/repositories/VariantManagementRepository.ts",
	"src/lib/pricing/loadVariantPricingData.ts",
	"src/lib/pricing/loadRatePlanPricingData.ts",
]

describe("Guardrail: catalog/pricing boundary", () => {
	it("prevents pricing-engine persistence access from catalog and loaders", () => {
		const violations: string[] = []
		for (const relativePath of CATALOG_FILES) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")

			if (/RatePlanOccupancyPolicy|EffectivePricingV2|PriceRule/.test(content)) {
				violations.push(`${relativePath} -> forbidden direct pricing persistence access`)
			}

			if (/getDefaultRatePlanWithRules|ensureDefaultRatePlan|getDefaultByVariant/.test(content)) {
				violations.push(`${relativePath} -> forbidden default/fallback pricing resolution`)
			}
		}

		expect(
			violations,
			`Found catalog-pricing boundary violations:\n${violations.join("\n")}`
		).toEqual([])
	})
})
