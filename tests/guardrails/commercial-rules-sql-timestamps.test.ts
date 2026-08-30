import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { listFilesUnderRoot } from "./_file-utils"

const source = readFileSync("src/lib/commercial-rules/commercialRulesRepository.ts", "utf8")
const rawSqlDateInterpolation = /sql`[\s\S]*?\$\{\s*new Date\(\)\s*\}[\s\S]*?`/g

describe("commercial rules raw SQL timestamps", () => {
	it("uses the database clock instead of interpolating Date instances", () => {
		expect(source).not.toContain("${new Date()}")
		expect(source.match(/CURRENT_TIMESTAMP/g)?.length).toBeGreaterThanOrEqual(4)
	})

	it("forbids JavaScript Date interpolation in raw SQL across runtime source", () => {
		const violations = listFilesUnderRoot("src").flatMap((file) => {
			const content = readFileSync(file, "utf8")
			rawSqlDateInterpolation.lastIndex = 0
			return rawSqlDateInterpolation.test(content) ? [file] : []
		})
		expect(violations, `Use CURRENT_TIMESTAMP or a typed query-builder update instead:\n${violations.join("\n")}`).toEqual([])
	})
})
