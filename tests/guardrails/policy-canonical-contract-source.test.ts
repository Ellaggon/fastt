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

	it("keeps /api/policies/resolve policy-backed without rule UI rollout", () => {
		const route = read("src/pages/api/policies/resolve.ts")
		const forbidden = [
			/resolveEffectiveRules/,
			/buildRuleSnapshot/,
			/mapRuleSnapshotToPolicyCards/,
			/comparePolicyAndRuleSnapshots/,
			new RegExp(["record", "Rules", "Ui", "Mismatch"].join("")),
			new RegExp(["RULES", "UI"].join("_")),
			new RegExp(["rules", "ui", "rollout"].join("-")),
			new RegExp(["rules", "ui", "validation"].join("-")),
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(route) ? [`Policy resolve route uses rule contract fallback ${pattern}`] : []
		)
		expect(violations).toEqual([])
		expect(route).toContain("mapResolvedPoliciesToUI")
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

	it("keeps final policy constraints and indexes persistent", () => {
		const dbConfig = read("db/config.ts")
		const migration = read("db/migrations/2026-07-10_policy_final_constraints_indexes.sql")

		expect(dbConfig).toContain('{ on: ["ownerProviderId", "category"] }')
		expect(dbConfig).toContain('{ on: ["groupId", "version"], unique: true }')
		expect(dbConfig).toContain('{ on: ["policyId", "ruleKey"], unique: true }')
		expect(migration).toContain("idx_policy_assignment_resolution_range")
		expect(migration).toContain("idx_policy_rule_policy_key_unique")
		expect(migration).toContain("policy_group_category_validate_insert")
		expect(migration).toContain("policy_assignment_scope_validate_insert")
		expect(migration).toContain("policy_exception_effective_dates_insert")
		expect(migration).toContain("CANCELLATION_TIER_INVALID")
		expect(migration).toContain("'Cancellation', 'Payment', 'CheckIn', 'NoShow'")
	})

	it("keeps provider policy readiness on batch coverage queries", () => {
		const readiness = read("src/lib/policies/providerPolicyReadiness.ts")
		const publicApi = read("src/modules/policies/public.ts")
		const repository = read(
			"src/modules/policies/infrastructure/repositories/PolicyCoverageQueryRepository.ts"
		)

		expect(readiness).toContain("listPolicyCoverageByProvider")
		expect(readiness).not.toContain("resolveEffectivePolicies")
		expect(publicApi).toContain("PolicyCoverageQueryRepository")
		expect(publicApi).toContain("listRatePlanCoverageByProvider")
		expect(repository).toContain("class PolicyCoverageQueryRepository")
		expect(repository).toContain("innerJoin(Policy, eq(Policy.groupId, PolicyAssignment.policyGroupId))")
	})
})
