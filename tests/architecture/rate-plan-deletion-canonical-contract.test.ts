import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { canonicalDatabaseTableNames } from "@/shared/infrastructure/db/schema/canonical-schema"

const read = (path: string) => readFileSync(path, "utf8")

describe("rate plan deletion canonical contract", () => {
	it("cleans commercial rules without querying retired pricing tables", () => {
		const repository = read(
			"src/modules/pricing/infrastructure/repositories/RatePlanCommandRepository.ts"
		)

		expect(repository).toContain("CommercialRuleApplication")
		expect(repository).toContain("CommercialRuleSet")
		expect(repository).not.toContain('delete from "PriceRule"')
		expect(repository).not.toContain('delete from "RatePlanOccupancyOverride"')
		expect(repository).not.toContain("removeOptional")
	})

	it("keeps retired pricing tables out of the canonical installation", () => {
		const tables = canonicalDatabaseTableNames()

		expect(tables).not.toContain("PriceRule")
		expect(tables).not.toContain("RatePlanOccupancyOverride")
	})
})
