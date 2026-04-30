import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"

type InvariantCoverage = {
	invariant: string
	files: string[]
}

const MATRIX: InvariantCoverage[] = [
	{
		invariant: "Search == Hold == Booking",
		files: [
			"tests/integration/inventory-hold-pricing-v2.test.ts",
			"tests/integration/booking-inventory-materialization.test.ts",
			"tests/integration/financial-reconciliation.test.ts",
		],
	},
	{
		invariant: "Preview == Effective == Search",
		files: [
			"tests/integration/pricing-preview-vs-search.test.ts",
			"tests/integration/pricing-rules-v2.test.ts",
			"tests/integration/pricing-rules-v2-bulk.test.ts",
		],
	},
	{
		invariant: "Determinism by (variantId, ratePlanId, date, occupancyKey)",
		files: [
			"tests/search/source-version-integrity.test.ts",
			"tests/search/ensure-pricing-coverage-scale.test.ts",
		],
	},
	{
		invariant: "Canonical occupancy model",
		files: [
			"tests/search/occupancy-key.test.ts",
			"tests/guardrails/no-manual-occupancy-key.test.ts",
		],
	},
	{
		invariant: "Read-path purity",
		files: ["tests/guardrails/no-read-path-side-effects.test.ts"],
	},
	{
		invariant: "No fallback / no V1",
		files: [
			"tests/guardrails/no-pricing-fallback-runtime.test.ts",
			"tests/guardrails/pricing-v1-runtime-guardrail.test.ts",
		],
	},
	{
		invariant: "SourceVersion occupancy-aware",
		files: ["tests/search/source-version-integrity.test.ts"],
	},
	{
		invariant: "RatePlan-first pricing semantics",
		files: [
			"tests/integration/rateplan-first-hardening.e2e.test.ts",
			"tests/integration/pricing-base-rate-rateplan-first.test.ts",
		],
	},
	{
		invariant: "Currency consistency (runtime canonical)",
		files: [
			"tests/integration/pricing-base-rate.test.ts",
			"tests/integration/pricing-preview-vs-search.test.ts",
		],
	},
]

describe("Architecture SoT invariants enforcement matrix", () => {
	it("keeps mandatory invariant checks wired in test suite", () => {
		const missing: string[] = []

		for (const row of MATRIX) {
			for (const file of row.files) {
				const abs = join(process.cwd(), file)
				if (!existsSync(abs)) {
					missing.push(`${row.invariant} -> missing ${file}`)
				}
			}
		}

		expect(missing, `Missing mandatory invariant coverage files:\n${missing.join("\n")}`).toEqual(
			[]
		)
	})
})
