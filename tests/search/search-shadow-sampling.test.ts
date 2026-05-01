import { beforeEach, describe, expect, it, vi } from "vitest"

import { readCounter } from "@/lib/observability/metrics"
import type { SearchEnginePort } from "@/modules/search/public"
import { SearchRuntimeOrchestrator } from "@/modules/search/public"

const getFeatureFlagMock = vi.fn<(name: string, context?: unknown) => boolean>(() => true)
const getSamplingRateMock = vi.fn<(context?: unknown) => number>(() => 0)

vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: (name: string, context?: unknown) => getFeatureFlagMock(name, context),
	getSearchShadowSamplingRate: (context?: unknown) => getSamplingRateMock(context),
	getSearchHealthThresholds: vi.fn(() => ({
		maxSellableMismatchRate: 0.01,
		maxReasonMismatchRate: 0.05,
		maxPriceMismatchRate: 0.02,
		maxCriticalMismatchRate: 0.005,
	})),
}))

function makeEngine(name: "canonical" | "new", run: SearchEnginePort["run"]): SearchEnginePort {
	return {
		name,
		run,
	}
}

describe("search shadow sampling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		getFeatureFlagMock.mockReturnValue(true)
	})

	it("skips shadow execution when sampling decision is false", async () => {
		getSamplingRateMock.mockReturnValue(0)
		const canonicalRun = vi.fn(async () => ({
			offers: [],
			reason: undefined,
			sellabilityByRatePlan: {},
		}))
		const newRun = vi.fn(async () => ({
			offers: [],
			reason: undefined,
			sellabilityByRatePlan: {},
		}))
		const skippedBefore = readCounter("search_shadow_skipped_total", {
			endpoint: "searchOffers",
			reason: "sampling",
			samplingRate: 0,
		})

		const orchestrator = new SearchRuntimeOrchestrator({
			shadowEngine: makeEngine("canonical", canonicalRun),
			primaryEngine: makeEngine("new", newRun),
			random: () => 0.99,
			reportBackfillCandidate: () => {},
		})
		await orchestrator.executeSearchOffers({
			input: {
				productId: "p-sampling",
				checkIn: new Date("2026-09-10T00:00:00.000Z"),
				checkOut: new Date("2026-09-12T00:00:00.000Z"),
				adults: 2,
				children: 0,
			},
			productId: "p-sampling",
			checkIn: new Date("2026-09-10T00:00:00.000Z"),
			checkOut: new Date("2026-09-12T00:00:00.000Z"),
			requestId: "r-sampling-off",
		})

		expect(canonicalRun).toHaveBeenCalledTimes(0)
		expect(newRun).toHaveBeenCalledTimes(1)
		expect(
			readCounter("search_shadow_skipped_total", {
				endpoint: "searchOffers",
				reason: "sampling",
				samplingRate: 0,
			})
		).toBeGreaterThan(skippedBefore)
	})

	it("runs shadow execution when sampled in", async () => {
		getSamplingRateMock.mockReturnValue(1)
		const canonicalRun = vi.fn(async () => ({
			offers: [],
			reason: undefined,
			sellabilityByRatePlan: {},
		}))
		const newRun = vi.fn(async () => ({
			offers: [],
			reason: undefined,
			sellabilityByRatePlan: {},
		}))

		const orchestrator = new SearchRuntimeOrchestrator({
			shadowEngine: makeEngine("canonical", canonicalRun),
			primaryEngine: makeEngine("new", newRun),
			random: () => 0.5,
			reportBackfillCandidate: () => {},
		})
		await orchestrator.executeSearchOffers({
			input: {
				productId: "p-sampling",
				checkIn: new Date("2026-09-10T00:00:00.000Z"),
				checkOut: new Date("2026-09-12T00:00:00.000Z"),
				adults: 2,
				children: 0,
			},
			productId: "p-sampling",
			checkIn: new Date("2026-09-10T00:00:00.000Z"),
			checkOut: new Date("2026-09-12T00:00:00.000Z"),
			requestId: "r-sampling-on",
		})

		expect(canonicalRun).toHaveBeenCalledTimes(1)
		expect(newRun).toHaveBeenCalledTimes(1)
	})
})
