import { describe, expect, it } from "vitest"

import { readCounter, recordSearchComparisonBreakdown } from "@/lib/observability/metrics"

describe("search segmented mismatch metrics", () => {
	it("records sellable/reason/price mismatch counters with rate plan and stay dimensions", () => {
		const tags = {
			endpoint: "searchOffers",
			dateRange: "2026-10-01:2026-10-05",
			ratePlanId: "rp-seg",
			occupancy: "2:1",
			lengthOfStay: 4,
		}
		const beforeSellable = readCounter("search_sellable_mismatch_total", tags)
		const beforeReason = readCounter("search_reason_code_mismatch_total", tags)
		const beforePrice = readCounter("search_price_mismatch_total", tags)

		recordSearchComparisonBreakdown({
			endpoint: tags.endpoint,
			sellableMismatch: true,
			reasonCodeMismatch: true,
			priceMismatch: true,
			dateRange: tags.dateRange,
			ratePlanId: tags.ratePlanId,
			occupancy: tags.occupancy,
			lengthOfStay: tags.lengthOfStay,
			includeGlobal: false,
		})

		expect(readCounter("search_sellable_mismatch_total", tags)).toBeGreaterThan(beforeSellable)
		expect(readCounter("search_reason_code_mismatch_total", tags)).toBeGreaterThan(beforeReason)
		expect(readCounter("search_price_mismatch_total", tags)).toBeGreaterThan(beforePrice)
	})
})
