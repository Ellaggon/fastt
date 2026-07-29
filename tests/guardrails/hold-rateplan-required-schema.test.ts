import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Guardrail: hold ratePlanId required schema", () => {
	it("requires ratePlanId in hold API and keeps Hold.ratePlanId mandatory in db schema", () => {
		const holdApi = read("src/pages/api/inventory/hold.ts")
		const dbConfig = read("src/shared/infrastructure/db/schema/tables.ts")
		const start = dbConfig.indexOf("export const Hold = pgTable")
		const end = dbConfig.indexOf("\nexport const ", start + 1)
		const holdTable = dbConfig.slice(start, end)
		expect(holdApi).toContain("ratePlanId: z.string().min(1)")
		expect(holdTable).toMatch(
			/ratePlanId:\s*txt\("ratePlanId"\)\.references\(\(\)\s*=>\s*RatePlan\.id\)/
		)
		expect(holdTable).not.toMatch(/ratePlanId:\s*txtOpt\("ratePlanId"\)/)
	})
})
