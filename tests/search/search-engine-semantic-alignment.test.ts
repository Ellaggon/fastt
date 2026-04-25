import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	CanonicalSearchAdapter,
	NewSearchPipelineAdapter,
	ReasonCode,
	resolveNewSearchOffers,
	resolveSearchOffers,
} from "@/modules/search/public"
import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"

vi.mock("@/modules/search/application/use-cases/resolve-search-offers", () => ({
	resolveSearchOffers: vi.fn(),
	resolveSearchOffersFromView: vi.fn(),
}))
vi.mock("@/modules/search/application/use-cases/new-search-strategy", () => ({
	resolveNewSearchOffers: vi.fn(),
}))

describe("search engine strategy split", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("routes canonical and new adapters through different strategy entrypoints", async () => {
		const input = {
			productId: "hotel-1",
			checkIn: new Date("2026-06-10T00:00:00.000Z"),
			checkOut: new Date("2026-06-12T00:00:00.000Z"),
			adults: 2,
			children: 0,
			rooms: 1,
			currency: "USD",
		}
		const canonicalExpected = {
			offers: [],
			reason: "missing_view_data",
			sellabilityByRatePlan: {},
		}
		const newResult = {
			offers: [],
			reason: "new_strategy_filtered",
			sellabilityByRatePlan: {
				"v1:rp1": {
					isSellable: false,
					reasonCodes: [ReasonCode.STALE_VIEW],
					price: { base: null, display: null },
					availability: { hasInventory: false, hasRestrictions: true },
					policies: { isCompliant: true },
				},
			},
		}
		const canonicalUseCaseMock = vi.mocked(resolveSearchOffers)
		const newStrategyMock = vi.mocked(resolveNewSearchOffers)
		canonicalUseCaseMock.mockResolvedValue(canonicalExpected)
		newStrategyMock.mockResolvedValue(newResult)

		const repo = new SearchOffersRepository()
		const canonical = new CanonicalSearchAdapter(repo)
		const candidate = new NewSearchPipelineAdapter(repo)

		const [canonicalOut, candidateResult] = await Promise.all([
			canonical.run(input),
			candidate.run(input),
		])

		expect(canonicalUseCaseMock).toHaveBeenCalledTimes(1)
		expect(newStrategyMock).toHaveBeenCalledTimes(1)
		expect(canonicalOut).toBe(canonicalExpected)
		expect(candidateResult).toBe(newResult)
		expect(canonicalOut).not.toEqual(candidateResult)
	})
})
