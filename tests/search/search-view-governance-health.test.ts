import { describe, expect, it } from "vitest"

import { SEARCH_VIEW_REASON_CODES } from "@/modules/search/public"
import { buildSearchViewGovernanceHealth } from "@/modules/search/application/services/search-view-health"

describe("buildSearchViewGovernanceHealth", () => {
	it("returns fresh state with full coverage", () => {
		const now = new Date("2026-07-01T10:00:00.000Z")
		const health = buildSearchViewGovernanceHealth({
			totalExpectedRows: 120,
			presentRows: 120,
			blockerGapRows: 0,
			lastMaterializedAt: "2026-07-01T09:45:00.000Z",
			now,
		})

		expect(health.isFresh).toBe(true)
		expect(health.coverageRatio).toBe(1)
		expect(health.reasonCodes).toEqual([SEARCH_VIEW_REASON_CODES.FRESH_VIEW])
		expect(health.gapsDetected).toBe(false)
		expect(health.gapRows).toBe(0)
	})

	it("returns stale + missing coverage when no data is materialized", () => {
		const now = new Date("2026-07-01T10:00:00.000Z")
		const health = buildSearchViewGovernanceHealth({
			totalExpectedRows: 60,
			presentRows: 0,
			blockerGapRows: 0,
			lastMaterializedAt: null,
			now,
		})

		expect(health.isFresh).toBe(false)
		expect(health.coverageRatio).toBe(0)
		expect(health.reasonCodes).toEqual([
			SEARCH_VIEW_REASON_CODES.STALE_VIEW,
			SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE,
		])
		expect(health.gapsDetected).toBe(true)
		expect(health.gapRows).toBe(60)
	})

	it("returns partial coverage when blocker gaps exist", () => {
		const now = new Date("2026-07-01T10:00:00.000Z")
		const health = buildSearchViewGovernanceHealth({
			totalExpectedRows: 100,
			presentRows: 100,
			blockerGapRows: 5,
			lastMaterializedAt: "2026-07-01T09:50:00.000Z",
			now,
		})

		expect(health.isFresh).toBe(true)
		expect(health.coverageRatio).toBe(0.95)
		expect(health.reasonCodes).toEqual([SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE])
		expect(health.gapsDetected).toBe(true)
		expect(health.blockerGapRows).toBe(5)
	})
})
