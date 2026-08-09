import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { incrementalAriRetryMinutes } from "@/lib/channel-manager/channel-manager-incremental-ari"
import {
	buildIncrementalAriHorizon,
	INCREMENTAL_AVAILABILITY_OPERATION,
	INCREMENTAL_RATES_OPERATION,
	incrementalAriOperation,
	parseIncrementalAriJobPayload,
} from "@/lib/channel-manager/channel-manager-incremental-queue"

describe("channel manager incremental ARI", () => {
	it("keeps availability and rates in independent operations", () => {
		expect(incrementalAriOperation("availability")).toBe(INCREMENTAL_AVAILABILITY_OPERATION)
		expect(incrementalAriOperation("rates_restrictions")).toBe(INCREMENTAL_RATES_OPERATION)
		expect(INCREMENTAL_AVAILABILITY_OPERATION).not.toBe(INCREMENTAL_RATES_OPERATION)
	})

	it("stores only identities and a dirty range, deduplicating entities at execution", () => {
		expect(
			parseIncrementalAriJobPayload({
				version: 1,
				domain: "availability",
				from: "2026-08-03",
				toExclusive: "2026-08-05",
				variantIds: ["room-1", "room-1", "room-2"],
				ratePlanIds: [],
				queuedAt: "2026-08-03T10:20:00.000Z",
			})
		).toEqual({
			version: 1,
			domain: "availability",
			from: "2026-08-03",
			toExclusive: "2026-08-05",
			variantIds: ["room-1", "room-2"],
			ratePlanIds: [],
			queuedAt: "2026-08-03T10:20:00.000Z",
			certificationId: null,
			certificationScenario: null,
		})
	})

	it("carries an explicit certification scenario only through the isolated QA worker path", () => {
		const payload = parseIncrementalAriJobPayload({
			version: 1,
			domain: "rates_restrictions",
			from: "2026-08-03",
			toExclusive: "2026-08-04",
			variantIds: ["room-1"],
			ratePlanIds: ["rate-1"],
			queuedAt: "2026-08-03T10:20:00.000Z",
			certificationId: "certification-1",
			certificationScenario: "min_stay",
		})

		expect(payload.certificationId).toBe("certification-1")
		expect(payload.certificationScenario).toBe("min_stay")
	})

	it("revalidates the certification boundary and records it on the incremental run", () => {
		const worker = readFileSync(
			"src/lib/channel-manager/channel-manager-incremental-ari.ts",
			"utf8"
		)

		expect(worker).toContain("assertProviderIntegrationCertificationRunLink")
		expect(worker).toContain("certificationId,")
		expect(worker).toContain('context: "certification"')
	})

	it("backs off transient Channex failures without delaying normal deltas for 15 minutes", () => {
		expect([1, 2, 3, 4, 5, 8].map(incrementalAriRetryMinutes)).toEqual([1, 2, 4, 8, 15, 15])
	})

	it("uses the same 500-day commercial horizon for broad baseline changes", () => {
		expect(buildIncrementalAriHorizon(new Date("2026-08-03T23:00:00.000Z"))).toEqual({
			from: "2026-08-03",
			toExclusive: "2027-12-16",
		})
	})
})
