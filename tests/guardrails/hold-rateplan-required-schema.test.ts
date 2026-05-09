import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Guardrail: hold ratePlanId required schema", () => {
	it("requires ratePlanId in hold API and keeps Hold.ratePlanId mandatory in db schema", () => {
		const holdApi = read("src/pages/api/inventory/hold.ts")
		const dbConfig = read("db/config.ts")
		expect(holdApi).toContain("ratePlanId: z.string().min(1)")
		expect(dbConfig).toMatch(
			/ratePlanId:\s*column\.text\(\{\s*references:\s*\(\)\s*=>\s*RatePlan\.columns\.id\s*\}\)/
		)
		expect(dbConfig).not.toMatch(
			/ratePlanId:\s*column\.text\(\{\s*references:\s*\(\)\s*=>\s*RatePlan\.columns\.id,\s*optional:\s*true\s*\}\)/
		)
	})
})

