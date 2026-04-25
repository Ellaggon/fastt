import type { SearchHealthThresholds } from "@/config/featureFlags"
import type { SearchShadowSummary } from "@/lib/observability/search-shadow-summary"

export type SearchEngineHealthEvaluation = {
	isHealthy: boolean
	reasons: string[]
	metrics: {
		totalComparisons: number
		sellableMismatchRate: number
		reasonMismatchRate: number
		priceMismatchRate: number
		criticalMismatchRate: number
		majorMismatchRate: number
		minorMismatchRate: number
	}
}

function ratioFromPct(pct: number): number {
	return Number(pct) / 100
}

export function evaluateSearchEngineHealth(input: {
	summary: SearchShadowSummary
	thresholds: SearchHealthThresholds
}): SearchEngineHealthEvaluation {
	const { summary, thresholds } = input
	const total = Math.max(1, Number(summary.mismatchRateGlobal.totalComparisons ?? 0))
	const sellableMismatchRate = Number(summary.mismatchRateGlobal.rates.sellable ?? 0) / 100
	const reasonMismatchRate = Number(summary.mismatchRateGlobal.rates.reasonCode ?? 0) / 100
	const priceMismatchRate = Number(summary.mismatchRateGlobal.rates.price ?? 0) / 100
	const criticalMismatchRate = ratioFromPct(summary.mismatchByType.critical.ratePct)
	const majorMismatchRate = ratioFromPct(summary.mismatchByType.major.ratePct)
	const minorMismatchRate = ratioFromPct(summary.mismatchByType.minor.ratePct)

	const reasons: string[] = []
	if (criticalMismatchRate > thresholds.maxCriticalMismatchRate) {
		reasons.push(
			`critical_mismatch_rate ${criticalMismatchRate.toFixed(6)} > ${thresholds.maxCriticalMismatchRate.toFixed(6)}`
		)
	}
	if (sellableMismatchRate > thresholds.maxSellableMismatchRate) {
		reasons.push(
			`sellable_mismatch_rate ${sellableMismatchRate.toFixed(6)} > ${thresholds.maxSellableMismatchRate.toFixed(6)}`
		)
	}
	if (reasonMismatchRate > thresholds.maxReasonMismatchRate) {
		reasons.push(
			`reason_mismatch_rate ${reasonMismatchRate.toFixed(6)} > ${thresholds.maxReasonMismatchRate.toFixed(6)}`
		)
	}
	if (priceMismatchRate > thresholds.maxPriceMismatchRate) {
		reasons.push(
			`price_mismatch_rate ${priceMismatchRate.toFixed(6)} > ${thresholds.maxPriceMismatchRate.toFixed(6)}`
		)
	}
	if (Number(summary.mismatchByType.critical.total) > 0 && total < 50) {
		reasons.push("critical_mismatch_detected_in_low_sample")
	}

	return {
		isHealthy: reasons.length === 0,
		reasons,
		metrics: {
			totalComparisons: Number(summary.mismatchRateGlobal.totalComparisons ?? 0),
			sellableMismatchRate,
			reasonMismatchRate,
			priceMismatchRate,
			criticalMismatchRate,
			majorMismatchRate,
			minorMismatchRate,
		},
	}
}
