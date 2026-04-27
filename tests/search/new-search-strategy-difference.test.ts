import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	CanonicalSearchAdapter,
	NewSearchPipelineAdapter,
	resolveNewSearchOffers,
	resolveSearchOffers,
} from "@/modules/search/public"
import { createSearchOffersRepositoryForTests } from "@/modules/search/testing-public"

vi.mock("@/modules/search/application/use-cases/resolve-search-offers", () => ({
	resolveSearchOffers: vi.fn(),
	resolveSearchOffersFromView: vi.fn(),
}))

describe("new search strategy convergence", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("preserves canonical output during convergence phase", async () => {
		const input = {
			productId: "hotel-x",
			checkIn: new Date("2026-07-01T00:00:00.000Z"),
			checkOut: new Date("2026-07-03T00:00:00.000Z"),
			adults: 2,
			children: 1,
			rooms: 1,
			currency: "USD",
		}
		const canonicalResult = {
			offers: [
				{
					variantId: "v1",
					variant: {
						id: "v1",
						productId: "hotel-x",
						kind: "hotel_room",
						pricing: {},
						capacity: {},
					},
					ratePlans: [
						{
							ratePlanId: "rp-a",
							basePrice: 200,
							finalPrice: 200,
							totalPrice: 200,
							taxesAndFees: {
								total: 200,
								base: 200,
								taxes: { included: [], excluded: [] },
								fees: { included: [], excluded: [] },
								currency: "USD",
							},
						},
					],
				},
			],
			reason: undefined,
			sellabilityByRatePlan: {
				"v1:rp-a": {
					isSellable: true,
					reasonCodes: [],
					price: {
						base: { amount: 200, currency: "USD" },
						display: { amount: 200, currency: "USD" },
					},
					availability: { hasInventory: true, hasRestrictions: false },
					policies: { isCompliant: true },
				},
				"v1:rp-b": {
					isSellable: false,
					reasonCodes: ["MISSING_COVERAGE"],
					price: { base: null, display: null },
					availability: { hasInventory: false, hasRestrictions: false },
					policies: { isCompliant: true },
					diagnostics: { missingCoverage: true },
				},
			},
		}
		vi.mocked(resolveSearchOffers).mockResolvedValue(canonicalResult as never)

		const repo = createSearchOffersRepositoryForTests()
		const [canonical, candidate, directStrategy] = await Promise.all([
			new CanonicalSearchAdapter(repo).run(input),
			new NewSearchPipelineAdapter(repo).run(input),
			resolveNewSearchOffers(input, { repo }),
		])

		expect(candidate).toEqual(directStrategy)
		expect(candidate).toEqual(canonical)
	})
})
