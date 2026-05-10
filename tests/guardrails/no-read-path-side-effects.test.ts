import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"
import { scanFilesWithRules, type GuardrailRule } from "./_guardrail-scanner"

const INCLUDE_ROOTS = [
	"src/modules/search/application/use-cases",
	"src/modules/search/application/queries",
	"src/modules/search/application/services",
	"src/modules/search/infrastructure/repositories",
]

const EXTRA_INCLUDE_FILES = [
	"src/pages/api/inventory/hold.ts",
	"src/modules/booking/application/use-cases/get-policies-for-booking.ts",
]

const BANNED_RULES: GuardrailRule[] = [
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
	return [...INCLUDE_ROOTS.flatMap((root) => listFilesUnderRoot(root)), ...EXTRA_INCLUDE_FILES]
		.filter((line) => line.length > 0)
		.filter(
			(line) => line !== "src/modules/search/application/use-cases/materialize-search-unit.ts"
		)
		.filter((line) => !line.startsWith("src/modules/search/infrastructure/wiring/"))
		.sort()
}

describe("Read path side-effects guardrail", () => {
	it("blocks pricing coverage/recompute/materialization and writes in read paths", () => {
		const files = listReadPathFiles()
		expect(files.length).toBeGreaterThan(0)
		const violations = scanFilesWithRules(files, BANNED_RULES)

		expect(
			violations,
			`Found forbidden side-effect triggers in read paths:\n${violations.join("\n")}`
		).toEqual([])
	})
})
