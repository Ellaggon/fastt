import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"
import { scanFilesWithRules, type GuardrailRule } from "./_guardrail-scanner"

const SEARCH_RUNTIME_ROOTS = [
	"src/modules/search/application",
	"src/modules/search/domain",
	"src/modules/search/infrastructure",
]

const EXCLUDED_EXACT_PATH = "src/modules/search/application/use-cases/materialize-search-unit.ts"

const BANNED: GuardrailRule[] = [
	{ name: "enqueueAutoBackfill", pattern: /\benqueueAutoBackfill\s*\(/g },
	{ name: "ensurePricingCoverage", pattern: /\bensurePricingCoverage[A-Za-z0-9_]*\s*\(/g },
	{ name: "materializeSearchUnit", pattern: /\bmaterializeSearchUnit(?:Range)?\s*\(/g },
	{ name: "db.insert", pattern: /\bdb\s*\.\s*insert\s*\(/g },
	{ name: "db.update", pattern: /\bdb\s*\.\s*update\s*\(/g },
	{ name: "db.delete", pattern: /\bdb\s*\.\s*delete\s*\(/g },
]

function listSearchRuntimeFiles(): string[] {
	return SEARCH_RUNTIME_ROOTS.flatMap((root) => listFilesUnderRoot(root))
		.filter((line) => line !== EXCLUDED_EXACT_PATH)
		.filter((line) => !line.includes("/materialize-"))
		.sort()
}

describe("Guardrail: search runtime side-effects", () => {
	it("blocks write/backfill side-effect patterns in search runtime paths", () => {
		const files = listSearchRuntimeFiles()
		expect(files.length).toBeGreaterThan(0)
		const violations = scanFilesWithRules(files, BANNED)

		expect(
			violations,
			`Found forbidden side-effects in search runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
