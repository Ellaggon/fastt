import { describe, expect, it } from "vitest"
import { collectCalls, collectImports } from "./_guardrail-ast"

const CATALOG_FILES = [
	"src/modules/catalog/infrastructure/repositories/CatalogReadModelRepository.ts",
	"src/modules/catalog/infrastructure/repositories/VariantManagementRepository.ts",
	"src/lib/pricing/loadVariantPricingData.ts",
	"src/lib/pricing/loadRatePlanPricingData.ts",
]

const BANNED_TABLE_IMPORTS = new Set(["RatePlanOccupancyPolicy", "EffectivePricingV2", "PriceRule"])
const BANNED_ENGINE_CALLS = new Set([
	"getDefaultRatePlanWithRules",
	"ensureDefaultRatePlan",
	"getDefaultByVariant",
	"computeEffectivePricingV2",
	"previewPricingRules",
	"computePricePreview",
])
const ALLOWED_READ_MODEL_IMPORTS = new Set([
	"RatePlanPricingReadRepository",
	"ratePlanPricingReadRepository",
])

describe("Guardrail: catalog/pricing boundary", () => {
	it("prevents pricing-engine persistence access from catalog and loaders", () => {
		const violations: string[] = []
		for (const relativePath of CATALOG_FILES) {
			const imports = collectImports(relativePath)
			const calls = collectCalls(relativePath)

			for (const imp of imports) {
				if (BANNED_TABLE_IMPORTS.has(imp.imported)) {
					violations.push(`${relativePath} -> forbidden pricing table import ${imp.imported}`)
				}
				if (
					imp.module.includes("/modules/pricing/application/use-cases/") &&
					!ALLOWED_READ_MODEL_IMPORTS.has(imp.imported)
				) {
					violations.push(`${relativePath} -> forbidden pricing engine use-case import`)
				}
			}

			for (const call of calls) {
				if (BANNED_ENGINE_CALLS.has(call.leaf)) {
					violations.push(`${relativePath} -> forbidden pricing engine call ${call.calleePath}`)
				}
			}
		}

		expect(
			violations,
			`Found catalog-pricing boundary violations:\n${violations.join("\n")}`
		).toEqual([])
	})
})
