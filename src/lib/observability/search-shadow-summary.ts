import { listAllCounters, parseCounterKey } from "./metrics"

type CounterEntry = { labels: Record<string, string>; value: number }

export type SearchShadowSummary = {
	endpoint: string
	mismatchRateGlobal: {
		totalComparisons: number
		sellableMismatch: number
		reasonMismatch: number
		priceMismatch: number
		rates: {
			sellable: number
			reasonCode: number
			price: number
		}
	}
	mismatchByType: {
		critical: { total: number; ratePct: number }
		major: { total: number; ratePct: number }
		minor: { total: number; ratePct: number }
	}
	topRatePlanMismatches: Array<{ ratePlanId: string; dateRange: string; mismatches: number }>
	topReasonCodeMismatches: Array<{
		baselineReasonCode: string
		candidateReasonCode: string
		mismatches: number
	}>
	shadow: {
		executed: number
		skipped: number
		executionRatePct: number
	}
}

function countersByName(name: string): CounterEntry[] {
	return listAllCounters()
		.map((item) => {
			const parsed = parseCounterKey(item.key)
			return {
				name: parsed.name,
				labels: parsed.labels,
				value: Number(item.value ?? 0),
			}
		})
		.filter((item) => item.name === name)
		.map(({ labels, value }) => ({ labels, value }))
}

function readEndpointGlobal(name: string, endpoint: string): number {
	return countersByName(name)
		.filter((entry) => entry.labels.endpoint === endpoint && Object.keys(entry.labels).length === 1)
		.reduce((sum, entry) => sum + entry.value, 0)
}

function pct(part: number, total: number): number {
	if (total <= 0) return 0
	return Number(((part / total) * 100).toFixed(4))
}

export function buildSearchShadowSummary(endpoint = "searchOffers"): SearchShadowSummary {
	const comparisons = readEndpointGlobal("search_comparison_total", endpoint)
	const sellableMismatch = readEndpointGlobal("search_sellable_mismatch_total", endpoint)
	const reasonMismatch = readEndpointGlobal("search_reason_code_mismatch_total", endpoint)
	const priceMismatch = readEndpointGlobal("search_price_mismatch_total", endpoint)

	const classificationTotals = countersByName("search_mismatch_classification_total")
		.filter((entry) => entry.labels.endpoint === endpoint)
		.reduce(
			(acc, entry) => {
				const type = String(entry.labels.mismatchType || "minor")
				if (type === "critical") acc.critical += entry.value
				if (type === "major") acc.major += entry.value
				if (type === "minor") acc.minor += entry.value
				return acc
			},
			{ critical: 0, major: 0, minor: 0 }
		)
	const classifiedTotal =
		classificationTotals.critical + classificationTotals.major + classificationTotals.minor

	const topRatePlans = Array.from(
		countersByName("search_mismatch_by_rateplan_total")
			.filter((entry) => entry.labels.endpoint === endpoint)
			.reduce((acc, entry) => {
				const key = `${entry.labels.ratePlanId || "unknown"}|${entry.labels.dateRange || "unknown"}`
				const prev = acc.get(key) ?? {
					ratePlanId: String(entry.labels.ratePlanId || "unknown"),
					dateRange: String(entry.labels.dateRange || "unknown"),
					mismatches: 0,
				}
				prev.mismatches += entry.value
				acc.set(key, prev)
				return acc
			}, new Map<string, { ratePlanId: string; dateRange: string; mismatches: number }>())
			.values()
	)
		.sort((a, b) => b.mismatches - a.mismatches)
		.slice(0, 10)

	const topReasonCodeMismatches = Array.from(
		countersByName("search_reason_code_pair_mismatch_total")
			.filter((entry) => entry.labels.endpoint === endpoint)
			.reduce((acc, entry) => {
				const baselineReasonCode = String(entry.labels.baselineReasonCode || "NONE")
				const candidateReasonCode = String(entry.labels.candidateReasonCode || "NONE")
				const key = `${baselineReasonCode}->${candidateReasonCode}`
				const prev = acc.get(key) ?? {
					baselineReasonCode,
					candidateReasonCode,
					mismatches: 0,
				}
				prev.mismatches += entry.value
				acc.set(key, prev)
				return acc
			}, new Map<string, { baselineReasonCode: string; candidateReasonCode: string; mismatches: number }>())
			.values()
	)
		.sort((a, b) => b.mismatches - a.mismatches)
		.slice(0, 10)

	const shadowExecuted = countersByName("search_shadow_execution_total")
		.filter((entry) => entry.labels.endpoint === endpoint)
		.reduce((sum, entry) => sum + entry.value, 0)
	const shadowSkipped = countersByName("search_shadow_skipped_total")
		.filter((entry) => entry.labels.endpoint === endpoint)
		.reduce((sum, entry) => sum + entry.value, 0)

	return {
		endpoint,
		mismatchRateGlobal: {
			totalComparisons: comparisons,
			sellableMismatch,
			reasonMismatch,
			priceMismatch,
			rates: {
				sellable: pct(sellableMismatch, Math.max(1, comparisons)),
				reasonCode: pct(reasonMismatch, Math.max(1, comparisons)),
				price: pct(priceMismatch, Math.max(1, comparisons)),
			},
		},
		mismatchByType: {
			critical: {
				total: classificationTotals.critical,
				ratePct: pct(classificationTotals.critical, Math.max(1, classifiedTotal)),
			},
			major: {
				total: classificationTotals.major,
				ratePct: pct(classificationTotals.major, Math.max(1, classifiedTotal)),
			},
			minor: {
				total: classificationTotals.minor,
				ratePct: pct(classificationTotals.minor, Math.max(1, classifiedTotal)),
			},
		},
		topRatePlanMismatches: topRatePlans,
		topReasonCodeMismatches,
		shadow: {
			executed: shadowExecuted,
			skipped: shadowSkipped,
			executionRatePct: pct(shadowExecuted, Math.max(1, shadowExecuted + shadowSkipped)),
		},
	}
}
