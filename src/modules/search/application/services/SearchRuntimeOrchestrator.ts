import {
	getFeatureFlag,
	getSearchShadowSamplingRate,
	type FeatureFlagContext,
} from "@/config/featureFlags"
import {
	logFallbackTriggered,
	logSearchComparison,
	logSearchComparisonDetailed,
} from "@/lib/observability/migration-logger"
import {
	incrementCounter,
	observeTiming,
	recordSearchComparisonBreakdown,
	recordSearchDecisionMismatchBreakdown,
} from "@/lib/observability/metrics"
import { logger } from "@/lib/observability/logger"
import { toISODate } from "@/shared/domain/date/date.utils"
import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import { shouldTriggerSearchAutoBackfill } from "@/modules/search/domain/search-fallback-policy"
import type { SearchEnginePort, SearchOffersInput } from "../ports/SearchEnginePort"
import { buildSearchComparisonSummary } from "../queries/build-search-comparison-summary"
import { classifySearchMismatch } from "./classifySearchMismatch"

function toDateOnly(value: Date): string {
	return toISODate(value)
}

function normalizeComparisonDecision(input: {
	key: string
	isSellable: boolean
	reasonCodes: string[]
	priceDisplay: { amount: number | null; currency: string | null }
}) {
	return {
		key: input.key,
		isSellable: input.isSellable,
		reasonCodes: [...input.reasonCodes].sort(),
		priceDisplay: {
			amount: input.priceDisplay.amount,
			currency: input.priceDisplay.currency,
		},
	}
}

function toDecisionMap(
	decisions: Array<{
		key: string
		isSellable: boolean
		reasonCodes: string[]
		priceDisplay: { amount: number | null; currency: string | null }
	}>
): Map<string, (typeof decisions)[number]> {
	return new Map(decisions.map((decision) => [decision.key, decision] as const))
}

function parseRatePlanIdFromDecisionKey(key: string): string {
	const separator = key.indexOf(":")
	if (separator < 0) return key
	return key.slice(separator + 1) || key
}

export class SearchRuntimeOrchestrator {
	// Runtime intentionally operates as single-engine (new pipeline) in Phase 2 final shape.
	// Shadow execution is optional and only used for observability/comparison hooks.
	// Primary response behavior must remain independent from shadow availability/results.
	constructor(
		private deps: {
			primaryEngine: SearchEnginePort
			shadowEngine?: SearchEnginePort
			random?: () => number
			reportBackfillCandidate?: (params: {
				productId: string
				from: string
				to: string
				reason: string
			}) => void
		}
	) {}

	private random(): number {
		return this.deps.random ? Number(this.deps.random()) : Math.random()
	}

	private async executeEngine(params: {
		engine: SearchEnginePort
		input: SearchOffersInput
	}): Promise<Awaited<ReturnType<SearchEnginePort["run"]>>> {
		return params.engine.run(params.input)
	}

	async executeSearchOffers(params: {
		input: SearchOffersInput
		productId: string
		checkIn: Date
		checkOut: Date
		debug?: boolean
		featureContext?: FeatureFlagContext & { requestId?: string }
		requestId: string
	}): Promise<SearchOffer<SearchUnit>[]> {
		const startedAt = Date.now()
		const endpoint = "searchOffers"
		incrementCounter("search_view_requests_total", { endpoint })
		const shadowCompareEnabled = getFeatureFlag("SEARCH_SHADOW_COMPARE", params.featureContext)
		const samplingRate = getSearchShadowSamplingRate(params.featureContext)
		const shouldRunShadowCompare =
			shadowCompareEnabled && samplingRate > 0 && this.random() < samplingRate
		const lengthOfStay = Math.max(
			0,
			Math.ceil((params.checkOut.getTime() - params.checkIn.getTime()) / 86_400_000)
		)
		const occupancy = `${Number(params.input.adults ?? 0)}:${Number(params.input.children ?? 0)}`

		try {
			const result = await this.executeEngine({
				engine: this.deps.primaryEngine,
				input: params.input,
			})

			if (shouldRunShadowCompare && this.deps.shadowEngine) {
				incrementCounter("search_shadow_execution_total", {
					endpoint,
					primaryEngine: this.deps.primaryEngine.name,
					samplingRate: Number(samplingRate.toFixed(4)),
				})
				const shadowStartedAt = Date.now()
				const shadowResult = await this.executeEngine({
					engine: this.deps.shadowEngine,
					input: params.input,
				})
				const primarySummary = buildSearchComparisonSummary(result)
				const shadowSummary = buildSearchComparisonSummary(shadowResult)
				const baselineSummary = shadowSummary
				const candidateSummary = primarySummary
				const baselineDecisions = baselineSummary.decisions
					.map(normalizeComparisonDecision)
					.sort((a, b) => a.key.localeCompare(b.key))
				const candidateDecisions = candidateSummary.decisions
					.map(normalizeComparisonDecision)
					.sort((a, b) => a.key.localeCompare(b.key))
				const baselineDecisionMap = toDecisionMap(baselineDecisions)
				const candidateDecisionMap = toDecisionMap(candidateDecisions)
				const sellableMismatch =
					JSON.stringify(baselineDecisions.map((d) => [d.key, d.isSellable])) !==
					JSON.stringify(candidateDecisions.map((d) => [d.key, d.isSellable]))
				const reasonCodeMismatch =
					JSON.stringify(baselineDecisions.map((d) => [d.key, d.reasonCodes])) !==
					JSON.stringify(candidateDecisions.map((d) => [d.key, d.reasonCodes]))
				const priceMismatch =
					JSON.stringify(baselineDecisions.map((d) => [d.key, d.priceDisplay])) !==
					JSON.stringify(candidateDecisions.map((d) => [d.key, d.priceDisplay]))
				const mismatch = sellableMismatch || reasonCodeMismatch || priceMismatch

				recordSearchComparisonBreakdown({
					endpoint,
					sellableMismatch,
					reasonCodeMismatch,
					priceMismatch,
					dateRange: `${toDateOnly(params.checkIn)}:${toDateOnly(params.checkOut)}`,
					occupancy,
					lengthOfStay,
				})
				const dateRange = `${toDateOnly(params.checkIn)}:${toDateOnly(params.checkOut)}`
				const allDecisionKeys = new Set([
					...baselineDecisionMap.keys(),
					...candidateDecisionMap.keys(),
				])
				for (const key of allDecisionKeys) {
					const baselineDecision = baselineDecisionMap.get(key)
					const candidateDecision = candidateDecisionMap.get(key)
					const sellableChanged =
						Boolean(baselineDecision?.isSellable) !== Boolean(candidateDecision?.isSellable)
					const reasonChanged =
						JSON.stringify(baselineDecision?.reasonCodes ?? []) !==
						JSON.stringify(candidateDecision?.reasonCodes ?? [])
					const priceChanged =
						JSON.stringify(baselineDecision?.priceDisplay ?? null) !==
						JSON.stringify(candidateDecision?.priceDisplay ?? null)
					if (!sellableChanged && !reasonChanged && !priceChanged) continue

					const mismatchType = classifySearchMismatch({
						baselineIsSellable: Boolean(baselineDecision?.isSellable),
						candidateIsSellable: Boolean(candidateDecision?.isSellable),
						reasonCodeMismatch: reasonChanged,
						priceMismatch: priceChanged,
					})
					if (mismatchType !== "none") {
						incrementCounter("search_mismatch_classification_total", {
							endpoint,
							mismatchType,
							ratePlanId: parseRatePlanIdFromDecisionKey(key),
							dateRange,
							occupancy,
							lengthOfStay,
						})
						logSearchComparisonDetailed({
							requestId: params.requestId,
							domain: "search",
							endpoint,
							durationMs: Date.now() - shadowStartedAt,
							mismatchType,
							hotelId: params.productId,
							ratePlanId: parseRatePlanIdFromDecisionKey(key),
							dateRange,
							occupancy: {
								adults: Number(params.input.adults ?? 0),
								children: Number(params.input.children ?? 0),
							},
							lengthOfStay,
							baseline: {
								isSellable: Boolean(baselineDecision?.isSellable),
								reasonCodes: baselineDecision?.reasonCodes ?? [],
								priceDisplay: baselineDecision?.priceDisplay ?? {
									amount: null,
									currency: null,
								},
							},
							candidate: {
								isSellable: Boolean(candidateDecision?.isSellable),
								reasonCodes: candidateDecision?.reasonCodes ?? [],
								priceDisplay: candidateDecision?.priceDisplay ?? {
									amount: null,
									currency: null,
								},
							},
						})
					}
					recordSearchDecisionMismatchBreakdown({
						endpoint,
						dateRange,
						ratePlanId: parseRatePlanIdFromDecisionKey(key),
						occupancy,
						lengthOfStay,
						baselineReasonCode: String(baselineDecision?.reasonCodes?.[0] ?? "NONE"),
						candidateReasonCode: String(candidateDecision?.reasonCodes?.[0] ?? "NONE"),
						sellableMismatch: sellableChanged,
						reasonCodeMismatch: reasonChanged,
						priceMismatch: priceChanged,
					})
					recordSearchComparisonBreakdown({
						endpoint,
						sellableMismatch: sellableChanged,
						reasonCodeMismatch: reasonChanged,
						priceMismatch: priceChanged,
						dateRange,
						ratePlanId: parseRatePlanIdFromDecisionKey(key),
						occupancy,
						lengthOfStay,
						includeGlobal: false,
					})
				}
				logSearchComparison({
					requestId: params.requestId,
					domain: "search",
					endpoint,
					mismatch,
					differences: {
						sellableMismatch,
						reasonCodeMismatch,
						priceMismatch,
					},
					reason: result.reason ?? null,
					baselineSummary,
					candidateSummary,
					durationMs: Date.now() - shadowStartedAt,
				})
			} else if (shadowCompareEnabled) {
				incrementCounter("search_shadow_skipped_total", {
					endpoint,
					reason: this.deps.shadowEngine ? "sampling" : "shadow_unavailable",
					samplingRate: Number(samplingRate.toFixed(4)),
				})
			}

			const durationMs = Date.now() - startedAt
			observeTiming("search_latency_ms", durationMs, {
				endpoint,
				engine: "new_pipeline",
			})
			incrementCounter("search_view_success_total", { endpoint })

			if (result.reason) {
				incrementCounter("search_view_empty_reason_total", { endpoint, reason: result.reason })
				if (shouldTriggerSearchAutoBackfill(result.reason)) {
					incrementCounter("search_view_anomalous_empty_total", {
						endpoint,
						reason: result.reason,
					})
					this.deps.reportBackfillCandidate?.({
						productId: params.productId,
						from: toDateOnly(params.checkIn),
						to: toDateOnly(new Date(params.checkOut.getTime() + 86_400_000)),
						reason: result.reason,
					})
				}
				logFallbackTriggered({
					requestId: params.requestId,
					domain: "search",
					endpoint,
					reason: result.reason,
					path: this.deps.primaryEngine.name,
					durationMs,
				})
				logger.warn("search.view.empty", {
					endpoint,
					productId: params.productId,
					reason: result.reason,
					durationMs,
					engine: this.deps.primaryEngine.name,
				})
			} else {
				logger.info("search.view.request", {
					endpoint,
					productId: params.productId,
					offersCount: result.offers.length,
					debugUnsellableCount: result.debugUnsellable?.length ?? undefined,
					durationMs,
					engine: this.deps.primaryEngine.name,
				})
				if (params.debug && result.debugUnsellable && result.debugUnsellable.length > 0) {
					logger.info("search.view.unsellable", {
						endpoint,
						productId: params.productId,
						items: result.debugUnsellable,
					})
				}
			}

			return result.offers
		} catch (error) {
			const durationMs = Date.now() - startedAt
			incrementCounter("search_view_error_total", { endpoint })
			observeTiming("search_latency_ms", durationMs, { endpoint, engine: "view_error" })
			logFallbackTriggered({
				requestId: params.requestId,
				domain: "search",
				endpoint,
				reason: "exception",
				path: "searchOffers",
				durationMs,
			})
			logger.error("search.view.error", {
				endpoint,
				productId: params.productId,
				message: error instanceof Error ? error.message : String(error),
				durationMs,
			})
			return []
		}
	}
}
