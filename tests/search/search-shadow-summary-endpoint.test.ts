import { describe, expect, it } from "vitest"

import { incrementCounter } from "@/lib/observability/metrics"
import { GET } from "@/pages/api/internal/observability/search-shadow-summary"

describe("search shadow summary endpoint", () => {
	it("returns aggregated mismatch summary for dashboard consumption", async () => {
		incrementCounter("search_comparison_total", { endpoint: "searchOffers" }, 10)
		incrementCounter("search_sellable_mismatch_total", { endpoint: "searchOffers" }, 4)
		incrementCounter("search_reason_code_mismatch_total", { endpoint: "searchOffers" }, 3)
		incrementCounter("search_price_mismatch_total", { endpoint: "searchOffers" }, 2)
		incrementCounter(
			"search_mismatch_classification_total",
			{ endpoint: "searchOffers", mismatchType: "critical", ratePlanId: "rp1" },
			2
		)
		incrementCounter(
			"search_mismatch_classification_total",
			{ endpoint: "searchOffers", mismatchType: "major", ratePlanId: "rp2" },
			3
		)
		incrementCounter(
			"search_mismatch_by_rateplan_total",
			{
				endpoint: "searchOffers",
				ratePlanId: "rp1",
				dateRange: "2026-10-01:2026-10-03",
				kind: "sellable",
			},
			5
		)
		incrementCounter(
			"search_reason_code_pair_mismatch_total",
			{
				endpoint: "searchOffers",
				baselineReasonCode: "NONE",
				candidateReasonCode: "STALE_VIEW",
				dateRange: "2026-10-01:2026-10-03",
			},
			6
		)

		const response = await GET({} as never)
		expect(response.status).toBe(200)
		const payload = await response.json()
		expect(payload.ok).toBe(true)
		expect(payload.endpoint).toBe("searchOffers")
		expect(payload.mismatch_rate_global.totalComparisons).toBeGreaterThan(0)
		expect(payload.mismatch_by_type.critical.total).toBeGreaterThan(0)
		expect(payload.topRatePlanMismatches.length).toBeGreaterThan(0)
		expect(payload.topReasonCodeMismatches.length).toBeGreaterThan(0)
	})
})
