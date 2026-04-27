import { describe, expect, it } from "vitest"

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
			for (const groupId of groupIds) {
				const candidates = (fixture.policiesByGroup[groupId] ?? []).filter((policy) => {
					const fromOk = !policy.effectiveFrom || policy.effectiveFrom <= asOfDate
					const toOk = !policy.effectiveTo || policy.effectiveTo >= asOfDate
					return fromOk && toOk
				})
				candidates.sort((a, b) => {
					if (a.version !== b.version) return b.version - a.version
					return a.id.localeCompare(b.id)
				})
				if (candidates[0]) out[groupId] = candidates[0]
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

describe("policies/PolicyResolutionDTO contract", () => {
	it("always returns canonical DTO shape with explicit fields", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a_pay",
					policyGroupId: "g_pay",
					category: "Payment",
					scope: "product",
					scopeId: "product_1",
					channel: null,
				},
			],
			policiesByGroup: {
				g_pay: [
					{
						id: "pol_pay_v1",
						groupId: "g_pay",
						description: "Pago en hotel",
						version: 1,
						status: "active",
					},
				],
			},
		})

		const resolved = await resolveEffectivePolicies(
			{ repo },
			{
				productId: "product_1",
				checkIn: "2026-05-10",
				checkOut: "2026-05-11",
				requiredCategories: ["Payment", "Cancellation"],
				onMissingCategory: "return_null",
			}
		)

		expect(resolved).toMatchObject({
			version: "v2",
			policies: expect.any(Array),
			missingCategories: expect.any(Array),
			coverage: {
				hasFullCoverage: false,
			},
			asOfDate: "2026-05-10",
			warnings: expect.any(Array),
		})
		expect(Array.isArray(resolved.policies)).toBe(true)
		expect(Array.isArray(resolved.missingCategories)).toBe(true)
		expect(Array.isArray(resolved.warnings)).toBe(true)
		expect(typeof resolved.coverage.hasFullCoverage).toBe("boolean")
		expect(resolved.missingCategories).toContain("Cancellation")
	})
})
