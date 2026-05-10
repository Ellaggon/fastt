import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"
import { collectCalls, collectImports } from "./_guardrail-ast"

const INCLUDE_ROOTS = [
	"src/modules/pricing/application",
	"src/modules/pricing/infrastructure",
	"src/modules/pricing/domain",
]

const BANNED_SYMBOLS = new Set([
	"ensureDefaultRatePlan",
	"getDefaultByVariant",
	"resolveRatePlanIdFromLegacyInput",
])

function listPricingCoreFiles(): string[] {
	return INCLUDE_ROOTS.flatMap((root) => listFilesUnderRoot(root)).sort()
}

describe("Guardrail: no pricing variant-core fallback", () => {
	it("blocks variant-first fallback paths in pricing core", () => {
		const files = listPricingCoreFiles()
		expect(files.length).toBeGreaterThan(0)
		const violations: string[] = []
		for (const relativePath of files) {
			const imports = collectImports(relativePath)
			const calls = collectCalls(relativePath)
			const bannedLocalNames = new Set(
				imports.filter((entry) => BANNED_SYMBOLS.has(entry.imported)).map((entry) => entry.local)
			)
			for (const call of calls) {
				if (BANNED_SYMBOLS.has(call.leaf) || bannedLocalNames.has(call.root)) {
					violations.push(`${relativePath} -> ${call.calleePath}`)
				}
			}
		}

		expect(
			violations,
			`Found forbidden variant-first fallback in pricing core:\n${violations.join("\n")}`
		).toEqual([])
	})
})
