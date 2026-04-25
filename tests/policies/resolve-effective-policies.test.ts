import { describe, it, expect } from "vitest"
import { resolveEffectivePolicies } from "@/modules/policies/testing-public"
import type {
	PolicyAssignmentSnapshot,
	PolicyResolutionRepositoryPort,
	PolicySnapshot,
} from "@/modules/policies/testing-public"

function makeRepo(fixture: {
	assignments: PolicyAssignmentSnapshot[]
	policiesByGroup: Record<string, PolicySnapshot[]>
}): PolicyResolutionRepositoryPort {
	return {
		async listActiveAssignments() {
			return fixture.assignments
		},
		async listActivePoliciesByGroupIds({ groupIds, asOfDate }) {
			const out: Record<string, PolicySnapshot> = {}
			for (const gid of groupIds) {
				const candidates = (fixture.policiesByGroup[gid] ?? []).filter((p) => {
					const fromOk = !p.effectiveFrom || p.effectiveFrom <= asOfDate
					const toOk = !p.effectiveTo || p.effectiveTo >= asOfDate
					return fromOk && toOk
				})
				candidates.sort((a, b) => {
					if (a.version !== b.version) return b.version - a.version
					return a.id.localeCompare(b.id)
				})
				if (candidates[0]) out[gid] = candidates[0]
			}
			return out
		},
		async listPolicyRulesByPolicyId() {
			return []
		},
		async listCancellationTiersByPolicyId() {
			return []
		},
	}
}

describe("policies/resolveEffectivePolicies (canonical resolver, isolated)", () => {
	it("returns empty when there are no assignments", async () => {
		const repo = makeRepo({ assignments: [], policiesByGroup: {} })
		const res = await resolveEffectivePolicies({ repo }, { productId: "p1" })
		expect(res.policies).toEqual([])
	})

	it("resolves product-level policy", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a1",
					policyGroupId: "g_pay",
					category: "payment",
					scope: "product",
					scopeId: "p1",
					channel: null,
				},
			],
			policiesByGroup: {
				g_pay: [
					{
						id: "pol_v1",
						groupId: "g_pay",
						description: "pay v1",
						version: 1,
						status: "active",
					},
				],
			},
		})

		const res = await resolveEffectivePolicies({ repo }, { productId: "p1" })
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].category).toBe("payment")
		expect(res.policies[0].resolvedFromScope).toBe("product")
		expect(res.policies[0].policy.id).toBe("pol_v1")
	})

	it("variant overrides product", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a_prod",
					policyGroupId: "g_rules",
					category: "house_rules",
					scope: "product",
					scopeId: "p1",
					channel: null,
				},
				{
					id: "a_var",
					policyGroupId: "g_rules_v",
					category: "house_rules",
					scope: "variant",
					scopeId: "v1",
					channel: null,
				},
			],
			policiesByGroup: {
				g_rules: [
					{ id: "p_rules_1", groupId: "g_rules", description: "p", version: 1, status: "active" },
				],
				g_rules_v: [
					{ id: "v_rules_1", groupId: "g_rules_v", description: "v", version: 1, status: "active" },
				],
			},
		})

		const res = await resolveEffectivePolicies({ repo }, { productId: "p1", variantId: "v1" })
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].resolvedFromScope).toBe("variant")
		expect(res.policies[0].policy.id).toBe("v_rules_1")
	})

	it("rate_plan overrides variant", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a_var",
					policyGroupId: "g_can_v",
					category: "cancellation",
					scope: "variant",
					scopeId: "v1",
					channel: null,
				},
				{
					id: "a_rp",
					policyGroupId: "g_can_rp",
					category: "cancellation",
					scope: "rate_plan",
					scopeId: "rp1",
					channel: null,
				},
			],
			policiesByGroup: {
				g_can_v: [
					{ id: "can_v1", groupId: "g_can_v", description: "v", version: 1, status: "active" },
				],
				g_can_rp: [
					{ id: "can_rp1", groupId: "g_can_rp", description: "rp", version: 1, status: "active" },
				],
			},
		})

		const res = await resolveEffectivePolicies(
			{ repo },
			{ productId: "p1", variantId: "v1", ratePlanId: "rp1" }
		)
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].resolvedFromScope).toBe("rate_plan")
		expect(res.policies[0].policy.id).toBe("can_rp1")
	})

	it("channel-specific assignment overrides null channel within same scope", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a_null",
					policyGroupId: "g_pay_null",
					category: "payment",
					scope: "product",
					scopeId: "p1",
					channel: null,
				},
				{
					id: "a_web",
					policyGroupId: "g_pay_web",
					category: "payment",
					scope: "product",
					scopeId: "p1",
					channel: "web",
				},
			],
			policiesByGroup: {
				g_pay_null: [
					{ id: "pay_null", groupId: "g_pay_null", description: "n", version: 1, status: "active" },
				],
				g_pay_web: [
					{ id: "pay_web", groupId: "g_pay_web", description: "w", version: 1, status: "active" },
				],
			},
		})

		const res = await resolveEffectivePolicies({ repo }, { productId: "p1", channel: "web" })
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].policy.id).toBe("pay_web")
	})

	it("falls back to null channel when channel-specific doesn't exist", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a_null",
					policyGroupId: "g_pay_null",
					category: "payment",
					scope: "product",
					scopeId: "p1",
					channel: null,
				},
			],
			policiesByGroup: {
				g_pay_null: [
					{ id: "pay_null", groupId: "g_pay_null", description: "n", version: 1, status: "active" },
				],
			},
		})

		const res = await resolveEffectivePolicies({ repo }, { productId: "p1", channel: "web" })
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].policy.id).toBe("pay_null")
	})

	it("picks latest version and filters by effective dates", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a1",
					policyGroupId: "g1",
					category: "payment",
					scope: "product",
					scopeId: "p1",
					channel: null,
				},
			],
			policiesByGroup: {
				g1: [
					{
						id: "p_old",
						groupId: "g1",
						description: "old",
						version: 1,
						status: "active",
						effectiveTo: "2000-01-01",
					},
					{ id: "p_new", groupId: "g1", description: "new", version: 2, status: "active" },
				],
			},
		})

		const res = await resolveEffectivePolicies({ repo }, { productId: "p1" })
		expect(res.policies).toHaveLength(1)
		expect(res.policies[0].policy.id).toBe("p_new")
	})
})
