import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const BANNED_PATTERNS = [
	{
		name: "getDefaultRatePlanWithRules(variantId)",
		pattern: /\bgetDefaultRatePlanWithRules\s*\(/g,
	},
	{ name: "getDefaultByVariant", pattern: /\bgetDefaultByVariant\s*\(/g },
	{ name: "ensureDefaultRatePlan", pattern: /\bensureDefaultRatePlan\s*\(/g },
]

function listMutationPathFiles(): string[] {
	return [
		"src/pages/api/pricing/generate-effective.ts",
		"src/pages/api/pricing/rule.ts",
		"src/pages/api/pricing/rule-update.ts",
		"src/pages/api/pricing/rule-delete.ts",
		"src/pages/api/pricing/preview.ts",
		"src/pages/api/pricing/preview-rules.ts",
	]
}

function isMutationEndpoint(content: string): boolean {
	return /\bexport\s+const\s+(POST|PUT|PATCH|DELETE)\s*:/.test(content)
}

describe("Guardrail: no default rate plan fallback in pricing mutations", () => {
	it("blocks implicit default-rate-plan fallback in pricing mutation endpoints", () => {
		const files = listMutationPathFiles()
		const violations: string[] = []

		for (const relativePath of files) {
			const content = readFileSync(join(process.cwd(), relativePath), "utf8")
			if (!isMutationEndpoint(content)) continue

			for (const rule of BANNED_PATTERNS) {
				rule.pattern.lastIndex = 0
				if (rule.pattern.test(content)) {
					violations.push(`${relativePath} -> ${rule.name}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden default-rate-plan fallback in mutation paths:\n${violations.join("\n")}`
		).toEqual([])
	})
})
