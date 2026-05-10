import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"
import { scanFilesWithRules, type GuardrailRule } from "./_guardrail-scanner"

const INCLUDE_ROOTS = [
	"src/modules/pricing/application",
	"src/modules/pricing/infrastructure",
	"src/modules/pricing/domain",
]

const BANNED_RULES: GuardrailRule[] = [
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
		const violations = scanFilesWithRules(files, BANNED_RULES)

		expect(
			violations,
			`Found forbidden variant-first fallback in pricing core:\n${violations.join("\n")}`
		).toEqual([])
	})
})
