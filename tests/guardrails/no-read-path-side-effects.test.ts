import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

type Rule = {
	name: string
	pattern: RegExp
}

const INCLUDE_GLOBS = [
	"src/modules/search/application/use-cases/**/*.ts",
	"src/modules/search/application/queries/**/*.ts",
	"src/modules/search/application/services/**/*.ts",
	"src/modules/search/infrastructure/repositories/**/*.ts",
	"src/pages/api/inventory/hold.ts",
	"src/modules/booking/application/use-cases/get-policies-for-booking.ts",
]

const EXCLUDE_GLOBS = [
	"src/modules/search/application/use-cases/materialize-search-unit.ts",
	"src/modules/search/infrastructure/wiring/**",
]

const BANNED_RULES: Rule[] = [
	{
		name: "ensurePricingCoverage call",
		pattern: /\bensurePricingCoverage(?:ForRequest(?:Runtime)?)?\s*\(/g,
	},
	{ name: "recompute call", pattern: /\brecompute[A-Za-z0-9_]*\s*\(/g },
	{ name: "materialize call", pattern: /\bmaterialize[A-Za-z0-9_]*\s*\(/g },
	{ name: "direct db insert", pattern: /\bdb\s*\.\s*insert\s*\(/g },
	{ name: "direct db update", pattern: /\bdb\s*\.\s*update\s*\(/g },
	{ name: "direct db delete", pattern: /\bdb\s*\.\s*delete\s*\(/g },
	{ name: "upsert usage", pattern: /\bupsert\s*\(/g },
	{
		name: "enqueue auto backfill trigger",
		pattern: /\benqueueAutoBackfill\s*\(/g,
	},
	{
		name: "import ensure-pricing-coverage module",
		pattern: /from\s+["'][^"']*ensure-pricing-coverage(?:-for-request)?[^"']*["']/g,
	},
	{
		name: "import recompute-effective-pricing-v2 module",
		pattern: /from\s+["'][^"']*recompute-effective-pricing-v2[^"']*["']/g,
	},
	{
		name: "import materialize-search-unit module",
		pattern: /from\s+["'][^"']*materialize-search-unit[^"']*["']/g,
	},
]

function listReadPathFiles(): string[] {
	const cmd = [
		"rg",
		"--files",
		...INCLUDE_GLOBS.flatMap((glob) => ["-g", glob]),
		...EXCLUDE_GLOBS.flatMap((glob) => ["-g", `!${glob}`]),
	].join(" ")
	const stdout = execSync(cmd, {
		cwd: process.cwd(),
		encoding: "utf8",
	})
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.sort()
}

describe("Read path side-effects guardrail", () => {
	it("blocks pricing coverage/recompute/materialization and writes in read paths", () => {
		const files = listReadPathFiles()
		expect(files.length).toBeGreaterThan(0)

		const violations: string[] = []
		for (const relativePath of files) {
			const absolutePath = join(process.cwd(), relativePath)
			const content = readFileSync(absolutePath, "utf8")
			for (const rule of BANNED_RULES) {
				rule.pattern.lastIndex = 0
				if (rule.pattern.test(content)) {
					violations.push(`${relativePath} -> ${rule.name}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden side-effect triggers in read paths:\n${violations.join("\n")}`
		).toEqual([])
	})
})
