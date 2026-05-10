import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listFilesUnderRoot } from "./_file-utils"

function listCatalogFiles(): string[] {
	return listFilesUnderRoot("src/modules/catalog")
}

const BANNED: Array<{ name: string; pattern: RegExp }> = [
	{ name: "EffectivePricingV2 access", pattern: /\bEffectivePricingV2\b/g },
	{ name: "PriceRule access", pattern: /\bPriceRule\b/g },
	{ name: "computeEffectivePricingV2 call", pattern: /\bcomputeEffectivePricingV2\s*\(/g },
	{ name: "computePricePreview call", pattern: /\bcomputePricePreview\s*\(/g },
	{ name: "previewPricingRules call", pattern: /\bpreviewPricingRules\s*\(/g },
]

describe("Guardrail: no catalog pricing leakage", () => {
	it("blocks catalog domain from importing or computing pricing engine internals", () => {
		const files = listCatalogFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")
			for (const rule of BANNED) {
				rule.pattern.lastIndex = 0
				if (rule.pattern.test(content)) {
					violations.push(`${relativePath} -> ${rule.name}`)
				}
			}
		}

		expect(violations, `Found catalog-to-pricing leakage:\n${violations.join("\n")}`).toEqual([])
	})
})
