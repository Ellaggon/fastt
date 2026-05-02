import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const CONFIG_PATH = join(process.cwd(), "db/config.ts")
const MIGRATIONS_DIR = join(process.cwd(), "db/migrations")

describe("Guardrail: no pricing V1 schema/runtime", () => {
	it("blocks V1 pricing tables in db runtime config", () => {
		const source = readFileSync(CONFIG_PATH, "utf8")
		const violations: string[] = []

		if (/const\s+EffectivePricing\s*=\s*defineTable\s*\(/.test(source)) {
			violations.push("db/config.ts -> EffectivePricing table declaration")
		}
		if (/const\s+PricingBaseRate\s*=\s*defineTable\s*\(/.test(source)) {
			violations.push("db/config.ts -> PricingBaseRate table declaration")
		}
		if (/\bEffectivePricing\b\s*,/.test(source)) {
			violations.push("db/config.ts -> EffectivePricing exported in defineDb tables")
		}
		if (/\bPricingBaseRate\b\s*,/.test(source)) {
			violations.push("db/config.ts -> PricingBaseRate exported in defineDb tables")
		}

		expect(violations, `Found forbidden V1 schema entries:\n${violations.join("\n")}`).toEqual([])
	})

	it("blocks CREATE/INSERT usage of V1 pricing tables in migrations", () => {
		const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"))
		const violations: string[] = []

		for (const file of migrationFiles) {
			const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
			if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?EffectivePricing"?/i.test(source)) {
				violations.push(`${file} -> CREATE TABLE EffectivePricing`)
			}
			if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?PricingBaseRate"?/i.test(source)) {
				violations.push(`${file} -> CREATE TABLE PricingBaseRate`)
			}
			if (/INSERT\s+INTO\s+"?EffectivePricing"?/i.test(source)) {
				violations.push(`${file} -> INSERT INTO EffectivePricing`)
			}
			if (/INSERT\s+INTO\s+"?PricingBaseRate"?/i.test(source)) {
				violations.push(`${file} -> INSERT INTO PricingBaseRate`)
			}
		}

		expect(
			violations,
			`Found forbidden V1 table writes in migrations:\n${violations.join("\n")}`
		).toEqual([])
	})
})
