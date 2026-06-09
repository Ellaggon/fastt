import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe.skip("legacy/audit rateplan template coupling", () => {
	it("legacy: RatePlanTemplate has been removed from the canonical schema", () => {
		const dbConfig = readFileSync(join(process.cwd(), "db/config.ts"), "utf8")
		expect(dbConfig).not.toContain("const RatePlanTemplate")
	})
})
