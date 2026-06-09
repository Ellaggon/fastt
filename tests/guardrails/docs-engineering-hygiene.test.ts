import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { listFilesUnderRoot } from "./_file-utils"

describe("Guardrail: engineering docs hygiene", () => {
	it("keeps docs aligned with current workspace language and pnpm commands", () => {
		const docs = listFilesUnderRoot("docs", ".md")
		const bannedPatterns = [
			/Rooms & Rates is the enterprise ARI hub/,
			/Rooms & Rates is now the enterprise ARI operating hub/,
			/\bnpm run check\b/,
			/\bnpm test\b/,
			/\bnpm audit\b/,
			/\bnpm install\b/,
			/\bnpx tsc\b/,
		]

		const violations = docs.flatMap((file) => {
			const source = readFileSync(file, "utf8")
			return bannedPatterns.flatMap((pattern) =>
				pattern.test(source) ? [`${file}: banned docs content ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Engineering docs must not reintroduce obsolete ARI-hub copy or npm/npx commands:\n${violations.join("\n")}`
		).toEqual([])
	})
})
