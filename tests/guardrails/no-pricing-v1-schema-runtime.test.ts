import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const configFile = join(process.cwd(), "db/config.ts")
const migrationsDir = join(process.cwd(), "db/migrations")

describe("Guardrail: no pricing V1 schema/runtime", () => {
	it("blocks EffectivePricing and PricingBaseRate declarations/exports in db config", () => {
		const content = readFileSync(configFile, "utf8")
		expect(content).not.toMatch(/const\s+EffectivePricing\s*=\s*defineTable\s*\(/)
		expect(content).not.toMatch(/const\s+PricingBaseRate\s*=\s*defineTable\s*\(/)
		expect(content).not.toMatch(/\bEffectivePricing\b\s*,/)
		expect(content).not.toMatch(/\bPricingBaseRate\b\s*,/)
	})

	it("blocks reintroduction of V1 pricing table creation in new migrations", () => {
		const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))
		const offenders: string[] = []
		for (const file of files) {
			const source = readFileSync(join(migrationsDir, file), "utf8")
			if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?EffectivePricing"?/i.test(source)) {
				offenders.push(`${file}: CREATE TABLE EffectivePricing`)
			}
			if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?PricingBaseRate"?/i.test(source)) {
				offenders.push(`${file}: CREATE TABLE PricingBaseRate`)
			}
		}
		expect(offenders).toEqual([])
	})
})
