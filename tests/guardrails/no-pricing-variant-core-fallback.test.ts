import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const INCLUDE_GLOBS = [
	"src/modules/pricing/application/**/*.ts",
	"src/modules/pricing/infrastructure/**/*.ts",
	"src/modules/pricing/domain/**/*.ts",
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
	const cmd = ["rg", "--files", ...INCLUDE_GLOBS.flatMap((glob) => ["-g", glob])].join(" ")
	const stdout = execSync(cmd, { cwd: process.cwd(), encoding: "utf8" })
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.sort()
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
