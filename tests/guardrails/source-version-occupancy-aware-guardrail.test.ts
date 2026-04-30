import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const computeFile = join(
	process.cwd(),
	"src/modules/pricing/application/use-cases/compute-effective-pricing-v2.ts"
)
const materializeFile = join(
	process.cwd(),
	"src/modules/search/application/use-cases/materialize-search-unit.ts"
)

describe("SourceVersion occupancy-aware guardrail", () => {
	it("includes occupancyKey in pricing compute sourceVersion payload", () => {
		const content = readFileSync(computeFile, "utf8")
		expect(content.includes("sourceVersion")).toBe(true)
		expect(content.includes("occupancyKey")).toBe(true)
		expect(content).toMatch(/createHash\(["']sha1["']\)/)
		expect(content).toMatch(/engine:\s*["']pricing_v2_shadow["']/)
	})

	it("passes occupancyKey into search materialization sourceVersion resolver", () => {
		const content = readFileSync(materializeFile, "utf8")
		expect(content).toMatch(/resolveSourceVersion\s*\(\s*\{[\s\S]*occupancyKey/s)
	})
})
