import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	listPolicyCoverageByProvider: vi.fn(),
	listRatePlansByProvider: vi.fn(),
}))

vi.mock("@/modules/policies/public", () => ({
	listPolicyCoverageByProvider: mocks.listPolicyCoverageByProvider,
}))

vi.mock("@/modules/pricing/public", () => ({
	listRatePlansByProvider: mocks.listRatePlansByProvider,
}))

import { getProviderPolicyReadiness } from "@/lib/policies/providerPolicyReadiness"

describe("getProviderPolicyReadiness", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.listRatePlansByProvider.mockResolvedValue([
			{ ratePlanId: "hotel-plan", productType: "hotel" },
			{ ratePlanId: "tour-plan", productType: "tour" },
			{ ratePlanId: "unknown-plan", productType: "other" },
		])
		mocks.listPolicyCoverageByProvider.mockImplementation(async (input) =>
			[
				{ ratePlanId: "hotel-plan", isComplete: true },
				{ ratePlanId: "tour-plan", isComplete: true },
				{ ratePlanId: "unknown-plan", isComplete: true },
			].map((row) => ({
				...row,
				coveredCategories: [...input.requiredCategories],
				missingCategories: [],
			}))
		)
	})

	it("evaluates each business line against its own required policy categories", async () => {
		const result = await getProviderPolicyReadiness("provider-1")

		expect(result).toMatchObject({
			totalRatePlans: 3,
			readyRatePlans: 2,
			incompleteRatePlans: 1,
		})
		expect(mocks.listPolicyCoverageByProvider).toHaveBeenCalledTimes(2)
		expect(
			mocks.listPolicyCoverageByProvider.mock.calls.map(([input]) => input.requiredCategories)
		).toEqual(
			expect.arrayContaining([
				expect.arrayContaining(["Cancellation", "Payment", "CheckIn", "NoShow"]),
				expect.arrayContaining(["Cancellation", "Payment", "NoShow"]),
			])
		)
	})
})
