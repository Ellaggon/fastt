import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("Guardrail: policy tables are the only contractual source", () => {
	it("keeps RatePlan compressed and free of cancellation/payment contract fields", () => {
		const dbConfig = read("db/config.ts")
		expect(dbConfig).not.toContain("const RatePlanTemplate")
		const ratePlan = dbConfig.match(/const RatePlan = defineTable\(\{[\s\S]*?\n\}\)/)?.[0] ?? ""
		const forbidden = [/paymentType/, /refundable/, /cancellation/i, /refund/i]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(ratePlan) ? [`RatePlan must not contain contractual field ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})

	it("blocks rule snapshots and rule comparisons from hold policy snapshots", () => {
		const holdUseCase = read("src/modules/inventory/application/use-cases/create-inventory-hold.ts")
		const policySnapshot = read(
			"src/modules/policies/application/use-cases/build-policy-snapshot.ts"
		)
		const source = `${holdUseCase}\n${policySnapshot}`
		const forbidden = [
			/resolveEffectiveRules/,
			/buildRuleSnapshot/,
			/ruleSnapshotJson/,
			/ruleBasedContractSnapshot/,
			/contractComparisonJson/,
			/ruleValidationJson/,
			/comparePolicyAndRuleSnapshots/,
			/comparePolicyContractVsRuleContract/,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(source) ? [`Hold policy snapshot uses non-canonical contract ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})

	it("keeps /api/policies/resolve policy-backed even when Rules UI rollout is enabled", () => {
		const route = read("src/pages/api/policies/resolve.ts")
		const forbidden = [
			/resolveEffectiveRules/,
			/buildRuleSnapshot/,
			/mapRuleSnapshotToPolicyCards/,
			/comparePolicyAndRuleSnapshots/,
			/recordRulesUiMismatch/,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(route) ? [`Policy resolve route uses rule contract fallback ${pattern}`] : []
		)
		expect(violations).toEqual([])
		expect(route).toContain("mapResolvedPoliciesToUI")
		expect(route).toContain("canonical_policy_source")
	})

	it("keeps hotel scope removed from policy assignment writes", () => {
		const scope = read("src/modules/policies/domain/policy.scope.ts")
		const assignEndpoint = read("src/pages/api/policies/assign.ts")
		const dateCancellationEndpoint = read("src/pages/api/policies/date-cancellation.ts")
		const replacement = read(
			"src/modules/policies/application/use-cases/capa6/replace-policy-assignment.ts"
		)
		const source = `${assignEndpoint}\n${dateCancellationEndpoint}\n${replacement}`

		expect(scope).toContain('"hotel" scope is intentionally not supported')
		expect(assignEndpoint).toContain('"product", "variant", "rate_plan"')
		expect(source).not.toMatch(/["']hotel["']/)
	})
})
