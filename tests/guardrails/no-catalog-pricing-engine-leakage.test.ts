import { describe, expect, it } from "vitest"
import { scanFilesWithRules, type GuardrailRule } from "./_guardrail-scanner"

const CATALOG_FILES = [
	"src/modules/catalog/infrastructure/repositories/CatalogReadModelRepository.ts",
	"src/modules/catalog/infrastructure/repositories/VariantManagementRepository.ts",
	"src/lib/pricing/loadVariantPricingData.ts",
	"src/lib/pricing/loadRatePlanPricingData.ts",
]

const BANNED_RULES: GuardrailRule[] = [
	{
		name: "forbidden direct pricing persistence access",
		pattern:
			/\b(?:RatePlanOccupancyPolicy|EffectivePricingV2|PriceRule)\b|(?:db|sql)\s*\.\s*(?:select|insert|update|delete)\s*\([^)]*(?:RatePlanOccupancyPolicy|EffectivePricingV2|PriceRule)/g,
	},
	{
		name: "forbidden default/fallback pricing resolution",
		pattern: /\b(?:getDefaultRatePlanWithRules|ensureDefaultRatePlan|getDefaultByVariant)\b/g,
	},
]

describe("Guardrail: catalog/pricing boundary", () => {
	it("prevents pricing-engine persistence access from catalog and loaders", () => {
		const violations = scanFilesWithRules(CATALOG_FILES, BANNED_RULES)

		expect(
			violations,
			`Found catalog-pricing boundary violations:\n${violations.join("\n")}`
		).toEqual([])
	})
})
