import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("marketplace geography retirement gate", () => {
	it("requires integrity-checked source and database evidence after the irreversible retirement", () => {
		const script = readFileSync("scripts/db/verify-legacy-geography-retirement.ts", "utf8")

		expect(script).toContain('scan("src"')
		expect(script).toContain('scan("tests"')
		expect(script).toContain('scan("src/scripts"')
		expect(script).toContain("evidenceIsIntact")
		expect(script).toContain("products_without_primary_place")
		expect(script).toContain("destination_table")
		expect(script).toContain("legacy_map_table")
		expect(script).toContain("backfill_table")
		expect(script).toContain("destination_id_columns")
		expect(script).toContain("information_schema.columns")
		expect(script).toContain('legacyColumnTables.has("Product")')
		expect(script).toContain('legacyColumnTables.has("MarketplaceEvent")')
		expect(script).toContain('process.argv.includes("--final")')
		expect(script).toContain("Legacy geography retirement gate failed")
	})
})
