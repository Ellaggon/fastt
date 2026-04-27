import { describe, expect, it } from "vitest"

import { evaluateSearchEngineHealth } from "@/modules/search/public"
import type { SearchShadowSummary } from "@/lib/observability/search-shadow-summary"

function buildSummary(overrides: Partial<SearchShadowSummary>): SearchShadowSummary {
	return {
		endpoint: "searchOffers",
		mismatchRateGlobal: {
			totalComparisons: 500,
			sellableMismatch: 3,
			reasonMismatch: 10,
			priceMismatch: 5,
			rates: {
				sellable: 0.6,
				reasonCode: 2,
				price: 1,
			},
		},
		mismatchByType: {
			critical: { total: 1, ratePct: 0.2 },
			major: { total: 4, ratePct: 0.8 },
			minor: { total: 3, ratePct: 0.6 },
		},
		topRatePlanMismatches: [],
		topReasonCodeMismatches: [],
		shadow: {
			executed: 0,
			skipped: 0,
			executionRatePct: 0,
		},
		...overrides,
	}
}

describe("evaluateSearchEngineHealth", () => {
	it("marks healthy when all rates are below thresholds", () => {
		const out = evaluateSearchEngineHealth({
			summary: buildSummary({}),
			thresholds: {
				maxSellableMismatchRate: 0.01,
				maxReasonMismatchRate: 0.05,
				maxPriceMismatchRate: 0.02,
				maxCriticalMismatchRate: 0.005,
			},
		})
		expect(out.isHealthy).toBe(true)
		expect(out.reasons).toEqual([])
	})

	it("fails immediately when critical mismatch exceeds threshold", () => {
		const out = evaluateSearchEngineHealth({
			summary: buildSummary({
				mismatchByType: {
					critical: { total: 10, ratePct: 1 },
					major: { total: 1, ratePct: 0.1 },
					minor: { total: 1, ratePct: 0.1 },
				},
			}),
			thresholds: {
				maxSellableMismatchRate: 0.2,
				maxReasonMismatchRate: 0.2,
				maxPriceMismatchRate: 0.2,
				maxCriticalMismatchRate: 0.005,
			},
		})
		expect(out.isHealthy).toBe(false)
		expect(out.reasons.some((reason) => reason.includes("critical_mismatch_rate"))).toBe(true)
	})

	it("fails on boundary over threshold for sellable mismatch", () => {
		const out = evaluateSearchEngineHealth({
			summary: buildSummary({
				mismatchRateGlobal: {
					totalComparisons: 200,
					sellableMismatch: 10,
					reasonMismatch: 1,
					priceMismatch: 1,
					rates: {
						sellable: 5.5,
						reasonCode: 0.1,
						price: 0.1,
					},
				},
			}),
			thresholds: {
				maxSellableMismatchRate: 0.05,
				maxReasonMismatchRate: 0.2,
				maxPriceMismatchRate: 0.2,
				maxCriticalMismatchRate: 0.1,
			},
		})
		expect(out.isHealthy).toBe(false)
		expect(out.reasons.some((reason) => reason.includes("sellable_mismatch_rate"))).toBe(true)
	})
})
