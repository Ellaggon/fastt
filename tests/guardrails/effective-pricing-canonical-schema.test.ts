import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const CONFIG_PATH = join(process.cwd(), "src/shared/infrastructure/db/schema/tables.ts")
const BASELINE_PATH = join(process.cwd(), "db/postgres/0001_initial_schema.sql")
const MIGRATIONS_DIR = join(process.cwd(), "db/migrations")
const ALLOWED_HISTORICAL_PRICING_MIGRATIONS = new Set([
	"2026-05-09_pricing_persistence_hardening.sql",
	"2026-07-22_hot_path_performance_indexes.sql",
	"2026-09-30_rename_effective_pricing.sql",
	"2026-10-01_normalize_effective_pricing_primary_key.sql",
])

describe("Guardrail: canonical effective pricing schema", () => {
	it("declares only the canonical effective-pricing projection", () => {
		const source = readFileSync(CONFIG_PATH, "utf8")
		const violations: string[] = []

		if (
			!/export\s+const\s+EffectivePricing\s*=\s*pgTable\s*\(\s*["']EffectivePricing["']/.test(
				source
			)
		) {
			violations.push(
				"src/shared/infrastructure/db/schema/tables.ts -> missing canonical EffectivePricing declaration"
			)
		}
		if (/\bEffectivePricingV2\b/.test(source)) {
			violations.push(
				"src/shared/infrastructure/db/schema/tables.ts -> retired EffectivePricingV2 declaration"
			)
		}
		if (/\bPricingBaseRate\b/.test(source)) {
			violations.push(
				"src/shared/infrastructure/db/schema/tables.ts -> retired PricingBaseRate declaration"
			)
		}

		expect(
			violations,
			`Found non-canonical pricing schema entries:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps the baseline and migrations on the canonical projection", () => {
		const baseline = readFileSync(BASELINE_PATH, "utf8")
		const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"))
		const violations: string[] = []
		if (!/CREATE\s+TABLE\s+"EffectivePricing"\s*\(/i.test(baseline)) {
			violations.push("db/postgres/0001_initial_schema.sql -> missing EffectivePricing table")
		}
		if (/\bEffectivePricingV2\b/.test(baseline)) {
			violations.push("db/postgres/0001_initial_schema.sql -> retired EffectivePricingV2 reference")
		}
		if (
			!/CREATE\s+TABLE\s+"EffectivePricing"\s*\([\s\S]*?"id"\s+text\s+PRIMARY\s+KEY/i.test(baseline)
		) {
			violations.push(
				"db/postgres/0001_initial_schema.sql -> missing canonical EffectivePricing primary key"
			)
		}

		for (const file of migrationFiles) {
			const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
			if (
				!ALLOWED_HISTORICAL_PRICING_MIGRATIONS.has(file) &&
				/\bEffectivePricingV2\b/.test(source)
			) {
				violations.push(
					`${file} -> retired EffectivePricingV2 reference outside transition history`
				)
			}
			if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?PricingBaseRate"?/i.test(source)) {
				violations.push(`${file} -> CREATE TABLE PricingBaseRate`)
			}
			if (/INSERT\s+INTO\s+"?PricingBaseRate"?/i.test(source)) {
				violations.push(`${file} -> INSERT INTO PricingBaseRate`)
			}
		}

		expect(violations, `Found retired pricing schema entries:\n${violations.join("\n")}`).toEqual(
			[]
		)
	})
})
