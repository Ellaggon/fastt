import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listFilesUnderRoot } from "./_file-utils"

const INCLUDE_ROOTS = [
	"src/modules/pricing/application",
	"src/modules/pricing/infrastructure",
	"src/modules/pricing/domain",
]

const BANNED_RULES: Array<{ name: string; pattern: RegExp }> = [
	{ name: "ensureDefaultRatePlan usage", pattern: /\bensureDefaultRatePlan\s*\(/g },
	{ name: "getDefaultByVariant usage", pattern: /\bgetDefaultByVariant\s*\(/g },
	{
		name: "legacy variant->rateplan adapter usage",
		pattern: /\bresolveRatePlanIdFromLegacyInput\s*\(/g,
	},
]

function listPricingCoreFiles(): string[] {
	return INCLUDE_ROOTS.flatMap((root) => listFilesUnderRoot(root)).sort()
}

describe("Guardrail: no pricing variant-core fallback", () => {
	it("blocks variant-first fallback paths in pricing core", () => {
		const files = listPricingCoreFiles()
		expect(files.length).toBeGreaterThan(0)

		const violations: string[] = []
		for (const relativePath of files) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")
			for (const rule of BANNED_RULES) {
				rule.pattern.lastIndex = 0
				if (rule.pattern.test(content)) {
					violations.push(`${relativePath} -> ${rule.name}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden variant-first fallback in pricing core:\n${violations.join("\n")}`
		).toEqual([])
	})
})
