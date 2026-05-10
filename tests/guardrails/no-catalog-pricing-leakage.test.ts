import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function listCatalogFiles(): string[] {
	const stdout = execSync('rg --files -g "src/modules/catalog/**/*.ts"', {
		cwd: process.cwd(),
		encoding: "utf8",
	})
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.sort()
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
