import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const configFile = join(process.cwd(), "db/config.ts")

describe("Guardrail: Hold requires ratePlanId", () => {
	it("keeps Hold.ratePlanId mandatory in db schema", () => {
		const content = readFileSync(configFile, "utf8")
		expect(content).toMatch(
			/ratePlanId:\s*column\.text\(\{\s*references:\s*\(\)\s*=>\s*RatePlan\.columns\.id\s*\}\)/
		)
		expect(content).not.toMatch(
			/ratePlanId:\s*column\.text\(\{\s*references:\s*\(\)\s*=>\s*RatePlan\.columns\.id,\s*optional:\s*true\s*\}\)/
		)
	})
})
