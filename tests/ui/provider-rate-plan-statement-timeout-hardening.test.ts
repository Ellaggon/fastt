import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("statement timeout hardening (rate plans hot path)", () => {
	it("memoizes RatePlan schema probes so information_schema is not hit per request", () => {
		const compat = read("src/lib/rates/ratePlanSchemaCompat.ts")
		expect(compat).toContain("let ratePlanColumnsPromise")
		expect(compat).toContain("ratePlanColumnsPromise = null")
		expect(compat).toContain("information_schema.columns")
	})

	it("serializes RatePlanConditionState background refreshes", () => {
		const state = read("src/lib/policies/ratePlanConditionState.ts")
		expect(state).toContain("conditionRefreshQueue")
		expect(state).toContain("conditionRefreshInflight")
		expect(state).toContain("scheduleRatePlanConditionStateRefresh")
		expect(state).not.toMatch(
			/void refreshRatePlanConditionStates\(\{ ratePlanIds: \[String\(row\.ratePlanId\)\]/
		)
	})

	it("keeps enough pooled connections for SSR fan-out", () => {
		const client = read("src/shared/infrastructure/db/client.ts")
		expect(client).toContain("FASTT_POSTGRES_POOL_MAX")
		expect(client).toContain("return 10")
		expect(client).toContain("idle_timeout: 20")
	})

	it("loads latest EffectivePricingV2 rows with DISTINCT ON instead of full scans", () => {
		const repo = read(
			"src/modules/pricing/infrastructure/repositories/RatePlanPricingReadRepository.ts"
		)
		expect(repo).toContain("select distinct on")
		expect(repo).toContain('"EffectivePricingV2"')
	})
})
