import { describe, expect, it } from "vitest"

import { listFilesUnderRoot } from "./_file-utils"
import { collectCalls, collectImports } from "./_guardrail-ast"

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

const BANNED_IMPORTED_SYMBOLS = new Set([
	"ensurePricingCoverage",
	"ensurePricingCoverageForRequest",
	"ensurePricingCoverageRuntime",
	"ensurePricingCoverageForRequestRuntime",
	"recomputeEffectivePricingV2",
	"materializeSearchUnitRange",
	"materializeSearchUnit",
	"enqueueAutoBackfill",
])

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
					violations.push(`${relativePath} -> direct db ${call.leaf}`)
					continue
				}
				if (
					["upsert", "enqueueAutoBackfill"].includes(call.leaf) ||
					call.leaf.startsWith("recompute") ||
					call.leaf.startsWith("materialize") ||
					call.leaf.startsWith("ensurePricingCoverage") ||
					bannedLocals.has(call.root)
				) {
					violations.push(`${relativePath} -> ${call.calleePath}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden side-effect triggers in read paths:\n${violations.join("\n")}`
		).toEqual([])
	})
})
