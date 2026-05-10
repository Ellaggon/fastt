import { describe, expect, it } from "vitest"

import { listFilesUnderRoot } from "./_file-utils"
import { collectCalls, collectImports } from "./_guardrail-ast"

const SEARCH_RUNTIME_ROOTS = [
	"src/modules/search/application",
	"src/modules/search/domain",
	"src/modules/search/infrastructure",
]

const EXCLUDED_EXACT_PATH = "src/modules/search/application/use-cases/materialize-search-unit.ts"

const BANNED_IMPORTED_SYMBOLS = new Set([
	"enqueueAutoBackfill",
	"ensurePricingCoverage",
	"ensurePricingCoverageForRequest",
	"ensurePricingCoverageRuntime",
	"recomputeEffectivePricingV2",
	"materializeSearchUnit",
	"materializeSearchUnitRange",
])

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

		const violations: string[] = []
		for (const relativePath of files) {
			const imports = collectImports(relativePath)
			const calls = collectCalls(relativePath)
			const bannedLocals = new Set(
				imports
					.filter((entry) => BANNED_IMPORTED_SYMBOLS.has(entry.imported))
					.map((entry) => entry.local)
			)

			for (const call of calls) {
				if (call.root === "db" && ["insert", "update", "delete"].includes(call.leaf)) {
					violations.push(`${relativePath} -> db.${call.leaf}`)
					continue
				}
				if (
					["enqueueAutoBackfill"].includes(call.leaf) ||
					call.leaf.startsWith("ensurePricingCoverage") ||
					call.leaf.startsWith("materializeSearchUnit") ||
					bannedLocals.has(call.root)
				) {
					violations.push(`${relativePath} -> ${call.calleePath}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden side-effects in search runtime:\n${violations.join("\n")}`
		).toEqual([])
	})
})
