import { describe, expect, it, vi } from "vitest"

import { getFeatureFlag } from "@/config/featureFlags"
import { readCounter, readTimingQuantile } from "@/lib/observability/metrics"
import { buildSearchShadowSummary } from "@/lib/observability/search-shadow-summary"
import { GET } from "@/pages/api/internal/observability/search-decision"

vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: vi.fn((name: string) => (name === "SEARCH_SHADOW_COMPARE" ? true : false)),
	getSearchHealthThresholds: vi.fn(() => ({
		maxSellableMismatchRate: 0.01,
		maxReasonMismatchRate: 0.05,
		maxPriceMismatchRate: 0.02,
		maxCriticalMismatchRate: 0.005,
	})),
}))

vi.mock("@/lib/observability/metrics", () => ({
	getMetricsWindow: vi.fn(() => ({ startedAt: 0, uptimeMs: 1000 })),
	readCounter: vi.fn(() => 0),
	readTimingQuantile: vi.fn(() => 100),
}))

vi.mock("@/lib/observability/search-shadow-summary", () => ({
	buildSearchShadowSummary: vi.fn(() => ({
		endpoint: "searchOffers",
		mismatchRateGlobal: {
			totalComparisons: 400,
			sellableMismatch: 1,
			reasonMismatch: 2,
			priceMismatch: 2,
			rates: { sellable: 0.25, reasonCode: 0.5, price: 0.5 },
		},
		mismatchByType: {
			critical: { total: 0, ratePct: 0 },
			major: { total: 2, ratePct: 0.5 },
			minor: { total: 2, ratePct: 0.5 },
		},
		topRatePlanMismatches: [],
		topReasonCodeMismatches: [],
		shadow: {
			executed: 400,
			skipped: 0,
			executionRatePct: 100,
		},
	})),
}))

describe("search decision endpoint", () => {
	it("evaluates health using operational signals only when shadow is disabled", async () => {
		vi.mocked(getFeatureFlag).mockReturnValue(false)
		vi.mocked(readCounter).mockReturnValue(0)
		vi.mocked(readTimingQuantile).mockReturnValue(120)

		const response = await GET({ request: new Request("http://localhost") } as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.ok).toBe(true)
		expect(payload.health.functional.enabled).toBe(false)
		expect(payload.health.functional.reasons).toEqual([])
		expect(["healthy", "degraded"]).toContain(payload.status)
	})

	it("includes functional mismatch health when shadow is active and executed", async () => {
		vi.mocked(getFeatureFlag).mockReturnValue(true)
		vi.mocked(buildSearchShadowSummary).mockReturnValue({
			endpoint: "searchOffers",
			mismatchRateGlobal: {
				totalComparisons: 400,
				sellableMismatch: 1,
				reasonMismatch: 2,
				priceMismatch: 2,
				rates: { sellable: 0.25, reasonCode: 0.5, price: 0.5 },
			},
			mismatchByType: {
				critical: { total: 0, ratePct: 0 },
				major: { total: 2, ratePct: 0.5 },
				minor: { total: 2, ratePct: 0.5 },
			},
			topRatePlanMismatches: [],
			topReasonCodeMismatches: [],
			shadow: {
				executed: 400,
				skipped: 0,
				executionRatePct: 100,
			},
		})

		const response = await GET({ request: new Request("http://localhost") } as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.ok).toBe(true)
		expect(payload.health.functional.enabled).toBe(true)
		expect(payload.health.functional.thresholds.maxCriticalMismatchRate).toBe(0.005)
		expect(["healthy", "degraded"]).toContain(payload.status)
	})
})
