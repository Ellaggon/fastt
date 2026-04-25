import { describe, expect, it } from "vitest"

import {
	type PolicyAssignmentSnapshot,
	type PolicyResolutionRepositoryPort,
	type PolicySnapshot,
	mapDTOToLegacy,
	mapLegacyToDTO,
	type LegacyPolicyResolutionResult,
	resolveEffectivePolicies,
	resolveEffectivePoliciesByContract,
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

describe("policies contract compatibility (legacy vs DTO)", () => {
	it("legacy output equals adapter(dto) for same input", async () => {
		const repo = makeRepo({
			assignments: [
				{
					id: "a1",
					policyGroupId: "g1",
					category: "Payment",
					scope: "product",
					scopeId: "product_1",
					channel: null,
				},
			],
			policiesByGroup: {
				g1: [
					{
						id: "policy_1",
						groupId: "g1",
						description: "Pago en la propiedad",
						version: 1,
						status: "active",
					},
				],
			},
		})

		const dto = await resolveEffectivePolicies(
			{ repo },
			{
				productId: "product_1",
				checkIn: "2026-06-01",
				checkOut: "2026-06-02",
				requiredCategories: ["Payment", "NoShow"],
			}
		)
		const legacyFromDto = mapDTOToLegacy(dto)

		const legacyDirect = await resolveEffectivePoliciesByContract(
			{ repo },
			{
				productId: "product_1",
				checkIn: "2026-06-01",
				checkOut: "2026-06-02",
				requiredCategories: ["Payment", "NoShow"],
				dtoV2Enabled: false,
			}
		)

		expect(legacyDirect).toEqual(legacyFromDto)
	})

	it("can rehydrate legacy payload into canonical DTO", async () => {
		const legacy: LegacyPolicyResolutionResult = {
			policies: [],
			missingCategories: ["Payment"],
		}
		const dto = mapLegacyToDTO(legacy, {
			asOfDate: "2026-06-10",
			warnings: ["legacy_contract"],
		})
		expect(dto).toMatchObject({
			version: "v2",
			policies: [],
			missingCategories: ["Payment"],
			coverage: {
				hasFullCoverage: false,
			},
			asOfDate: "2026-06-10",
			warnings: ["legacy_contract"],
		})
	})
})
