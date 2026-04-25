import { beforeEach, describe, expect, it, vi } from "vitest"

import * as policiesPublic from "@/modules/policies/public"
import type { LegacyPolicyResolutionResult, PolicyResolutionDTO } from "@/modules/policies/public"

const resolveEffectivePoliciesMock = vi.fn()
const resolveRatePlanOwnerContextMock = vi.fn()

vi.mock("@/modules/pricing/public", () => ({
	resolveRatePlanOwnerContext: (...args: any[]) => resolveRatePlanOwnerContextMock(...args),
}))

describe("ui/ssr policies surface compatibility (flag off/on)", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		resolveRatePlanOwnerContextMock.mockReset()
		resolveEffectivePoliciesMock.mockReset()
		resolveRatePlanOwnerContextMock.mockResolvedValue({
			productId: "product_1",
			variantId: "variant_1",
		})

		vi.spyOn(policiesPublic, "resolveEffectivePolicies").mockImplementation((...args: any[]) =>
			resolveEffectivePoliciesMock(...args)
		)
		vi.spyOn(policiesPublic, "derivePolicySummaryFromResolvedPolicies").mockReturnValue("Resumen")
		vi.spyOn(policiesPublic, "mapResolvedPoliciesToUI").mockImplementation(
			(resolved: PolicyResolutionDTO | LegacyPolicyResolutionResult) =>
				(resolved.policies ?? []).map((item: any) => ({
					category: item.category,
					description: String(item?.policy?.description ?? "Sin definir"),
					version: Number(item?.policy?.version ?? 0),
					resolvedFromScope: item?.resolvedFromScope ?? "global",
				}))
		)
	})

	it("builds SSR surface when resolver returns legacy shape (flag OFF)", async () => {
		resolveEffectivePoliciesMock.mockResolvedValue({
			policies: [],
			missingCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		} satisfies LegacyPolicyResolutionResult)

		const out = await policiesPublic.buildRatePlanPoliciesSurface({
			variantName: "Standard",
			checkIn: "2026-07-10",
			checkOut: "2026-07-11",
			ratePlans: [{ id: "rp_1", name: "Flexible" }],
		})

		expect(out.policyPlans).toHaveLength(1)
		expect(out.policyPlans[0].coverageCount).toBe(0)
		expect(out.policyPlans[0].missingCategories).toEqual([
			"Cancellation",
			"Payment",
			"CheckIn",
			"NoShow",
		])
	})

	it("builds SSR surface when resolver returns DTO shape (flag ON)", async () => {
		resolveEffectivePoliciesMock.mockResolvedValue({
			version: "v2",
			policies: [
				{
					category: "Payment",
					resolvedFromScope: "rate_plan",
					policy: {
						id: "pol_1",
						groupId: "grp_1",
						description: "Pago en hotel",
						version: 1,
						status: "active",
						rules: [],
						cancellationTiers: [],
					},
				},
			],
			missingCategories: ["Cancellation", "CheckIn", "NoShow"],
			coverage: {
				hasFullCoverage: false,
			},
			asOfDate: "2026-07-10",
			warnings: [],
		} satisfies PolicyResolutionDTO)

		const out = await policiesPublic.buildRatePlanPoliciesSurface({
			variantName: "Standard",
			checkIn: "2026-07-10",
			checkOut: "2026-07-11",
			ratePlans: [{ id: "rp_1", name: "Flexible" }],
		})

		expect(out.policyPlans).toHaveLength(1)
		expect(out.policyPlans[0].coverageCount).toBe(1)
		expect(out.policyPlans[0].missingCategories).toEqual(["Cancellation", "CheckIn", "NoShow"])
	})
})
