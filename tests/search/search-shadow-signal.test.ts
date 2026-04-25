import { beforeEach, describe, expect, it, vi } from "vitest"

import { readCounter, readSearchComparisonRates } from "@/lib/observability/metrics"
import {
	ReasonCode,
	SearchRuntimeOrchestrator,
	type SearchEnginePort,
} from "@/modules/search/public"

vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: vi.fn(() => true),
	getSearchShadowSamplingRate: vi.fn(() => 1),
	getSearchHealthThresholds: vi.fn(() => ({
		maxSellableMismatchRate: 0.01,
		maxReasonMismatchRate: 0.05,
		maxPriceMismatchRate: 0.02,
		maxCriticalMismatchRate: 0.005,
	})),
}))

describe("search shadow compare signal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("records meaningful mismatch rates and breakdown counters", async () => {
		const endpoint = "searchOffers"
		const dateRange = "2026-08-01:2026-08-04"
		const occupancy = "2:1"
		const lengthOfStay = 3
		const baselineTotal = readCounter("search_comparison_total", { endpoint })
		const baselineSellable = readCounter("search_sellable_mismatch_total", { endpoint })
		const baselineReason = readCounter("search_reason_code_mismatch_total", { endpoint })
		const baselinePrice = readCounter("search_price_mismatch_total", { endpoint })
		const baselinePair = readCounter("search_reason_code_pair_mismatch_total", {
			endpoint,
			dateRange,
			occupancy,
			lengthOfStay,
			baselineReasonCode: "NONE",
			candidateReasonCode: "STALE_VIEW",
		})
		const baselineRatePlanSellable = readCounter("search_mismatch_by_rateplan_total", {
			endpoint,
			dateRange,
			occupancy,
			lengthOfStay,
			ratePlanId: "rp-1",
			kind: "sellable",
		})
		const baselineRatePlanReason = readCounter("search_mismatch_by_rateplan_total", {
			endpoint,
			dateRange,
			occupancy,
			lengthOfStay,
			ratePlanId: "rp-1",
			kind: "reason_code",
		})
		const baselineRatePlanPrice = readCounter("search_mismatch_by_rateplan_total", {
			endpoint,
			dateRange,
			occupancy,
			lengthOfStay,
			ratePlanId: "rp-1",
			kind: "price",
		})

		const shadowEngine: SearchEnginePort = {
			name: "canonical",
			run: async () => ({
				offers: [],
				reason: undefined,
				sellabilityByRatePlan: {
					"v1:rp-1": {
						isSellable: true,
						reasonCodes: [],
						price: {
							base: { amount: 100, currency: "USD" },
							display: { amount: 100, currency: "USD" },
						},
						availability: { hasInventory: true, hasRestrictions: false },
						policies: { isCompliant: true },
					},
				},
			}),
		}
		const primaryEngine: SearchEnginePort = {
			name: "new",
			run: async () => ({
				offers: [],
				reason: undefined,
				sellabilityByRatePlan: {
					"v1:rp-1": {
						isSellable: false,
						reasonCodes: [ReasonCode.STALE_VIEW],
						price: {
							base: { amount: 100, currency: "USD" },
							display: { amount: 105, currency: "USD" },
						},
						availability: { hasInventory: false, hasRestrictions: true },
						policies: { isCompliant: true },
					},
				},
			}),
		}

		const orchestrator = new SearchRuntimeOrchestrator({
			shadowEngine,
			primaryEngine,
			enqueueAutoBackfill: () => {},
		})

		await orchestrator.executeSearchOffers({
			input: {
				productId: "p-shadow",
				checkIn: new Date("2026-08-01T00:00:00.000Z"),
				checkOut: new Date("2026-08-04T00:00:00.000Z"),
				adults: 2,
				children: 1,
				rooms: 1,
				currency: "USD",
			},
			productId: "p-shadow",
			checkIn: new Date("2026-08-01T00:00:00.000Z"),
			checkOut: new Date("2026-08-04T00:00:00.000Z"),
			requestId: "req-shadow",
		})

		const rates = readSearchComparisonRates(endpoint)
		expect(rates.search_sellable_mismatch_rate).toBeGreaterThan(0)
		expect(rates.search_reason_code_mismatch_rate).toBeGreaterThan(0)
		expect(rates.search_price_mismatch_rate).toBeGreaterThan(0)
		expect(readCounter("search_comparison_total", { endpoint })).toBeGreaterThan(baselineTotal)
		expect(readCounter("search_sellable_mismatch_total", { endpoint })).toBeGreaterThan(
			baselineSellable
		)
		expect(readCounter("search_reason_code_mismatch_total", { endpoint })).toBeGreaterThan(
			baselineReason
		)
		expect(readCounter("search_price_mismatch_total", { endpoint })).toBeGreaterThan(baselinePrice)
		expect(
			readCounter("search_reason_code_pair_mismatch_total", {
				endpoint,
				dateRange,
				occupancy,
				lengthOfStay,
				baselineReasonCode: "NONE",
				candidateReasonCode: "STALE_VIEW",
			})
		).toBeGreaterThan(baselinePair)
		expect(
			readCounter("search_mismatch_by_rateplan_total", {
				endpoint,
				dateRange,
				occupancy,
				lengthOfStay,
				ratePlanId: "rp-1",
				kind: "sellable",
			})
		).toBeGreaterThan(baselineRatePlanSellable)
		expect(
			readCounter("search_mismatch_by_rateplan_total", {
				endpoint,
				dateRange,
				occupancy,
				lengthOfStay,
				ratePlanId: "rp-1",
				kind: "reason_code",
			})
		).toBeGreaterThan(baselineRatePlanReason)
		expect(
			readCounter("search_mismatch_by_rateplan_total", {
				endpoint,
				dateRange,
				occupancy,
				lengthOfStay,
				ratePlanId: "rp-1",
				kind: "price",
			})
		).toBeGreaterThan(baselineRatePlanPrice)
	})
})
