import { listAllCounters, parseCounterKey } from "./metrics"

type CounterEntry = { labels: Record<string, string>; value: number }

type MismatchCause =
	| "base_component_mismatch"
	| "occupancy_adjustment_mismatch"
	| "rule_adjustment_mismatch"
	| "missing_v2_row"

export type PricingV2ShadowReport = {
	global: {
		totalEvaluated: number
		matches: number
		mismatches: number
		missing: number
		mismatchRatio: number
		missingRatio: number
		coverageV2Pct: number
	}
	byOccupancyKey: Array<{
		occupancyKey: string
		totalEvaluated: number
		matches: number
		mismatches: number
		missing: number
		mismatchRatio: number
		missingRatio: number
		coverageV2Pct: number
	}>
	byRatePlanId: Array<{
		ratePlanId: string
		totalEvaluated: number
		matches: number
		mismatches: number
		missing: number
		mismatchRatio: number
		missingRatio: number
	}>
	mismatchCauses: Array<{
		cause: MismatchCause
		total: number
		ratio: number
	}>
	topMismatches: Array<{
		ratePlanId: string
		occupancyKey: string
		date: string
		mismatches: number
		missing: number
		totalEvaluated: number
		mismatchRatio: number
		missingRatio: number
		coverageV2Pct: number
	}>
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
		.filter((item) => item.name === name && item.labels.endpoint === "searchOffers")
		.map(({ labels, value }) => ({ labels, value }))
}

function ratio(part: number, total: number): number {
	if (total <= 0) return 0
	return Number((part / total).toFixed(6))
}

export function buildPricingV2ShadowReport(): PricingV2ShadowReport {
	const totalEntries = countersByName("search_v2_shadow_total")
	const matchEntries = countersByName("search_v2_shadow_match_total")
	const mismatchEntries = countersByName("search_v2_shadow_mismatch_total")
	const missingEntries = countersByName("search_v2_shadow_missing_total")
	const causeEntries = countersByName("search_v2_shadow_mismatch_cause_total")

	const totalEvaluated = totalEntries.reduce((sum, item) => sum + item.value, 0)
	const matches = matchEntries.reduce((sum, item) => sum + item.value, 0)
	const mismatches = mismatchEntries.reduce((sum, item) => sum + item.value, 0)
	const missing = missingEntries.reduce((sum, item) => sum + item.value, 0)
	const coverageV2Pct = Number(
		(Math.max(0, totalEvaluated - missing) / Math.max(1, totalEvaluated)).toFixed(6)
	)

	const byOccupancyMap = new Map<
		string,
		{
			totalEvaluated: number
			matches: number
			mismatches: number
			missing: number
		}
	>()
	for (const item of totalEntries) {
		const key = String(item.labels.occupancyKey || "unknown")
		const row = byOccupancyMap.get(key) ?? {
			totalEvaluated: 0,
			matches: 0,
			mismatches: 0,
			missing: 0,
		}
		row.totalEvaluated += item.value
		byOccupancyMap.set(key, row)
	}
	for (const item of matchEntries) {
		const key = String(item.labels.occupancyKey || "unknown")
		const row = byOccupancyMap.get(key)
		if (row) row.matches += item.value
	}
	for (const item of mismatchEntries) {
		const key = String(item.labels.occupancyKey || "unknown")
		const row = byOccupancyMap.get(key)
		if (row) row.mismatches += item.value
	}
	for (const item of missingEntries) {
		const key = String(item.labels.occupancyKey || "unknown")
		const row = byOccupancyMap.get(key)
		if (row) row.missing += item.value
	}

	const byRatePlanMap = new Map<
		string,
		{
			totalEvaluated: number
			matches: number
			mismatches: number
			missing: number
		}
	>()
	for (const item of totalEntries) {
		const key = String(item.labels.ratePlanId || "unknown")
		const row = byRatePlanMap.get(key) ?? {
			totalEvaluated: 0,
			matches: 0,
			mismatches: 0,
			missing: 0,
		}
		row.totalEvaluated += item.value
		byRatePlanMap.set(key, row)
	}
	for (const item of matchEntries) {
		const key = String(item.labels.ratePlanId || "unknown")
		const row = byRatePlanMap.get(key)
		if (row) row.matches += item.value
	}
	for (const item of mismatchEntries) {
		const key = String(item.labels.ratePlanId || "unknown")
		const row = byRatePlanMap.get(key)
		if (row) row.mismatches += item.value
	}
	for (const item of missingEntries) {
		const key = String(item.labels.ratePlanId || "unknown")
		const row = byRatePlanMap.get(key)
		if (row) row.missing += item.value
	}

	const topMismatchMap = new Map<
		string,
		{
			ratePlanId: string
			occupancyKey: string
			date: string
			totalEvaluated: number
			mismatches: number
			missing: number
		}
	>()
	for (const item of totalEntries) {
		const ratePlanId = String(item.labels.ratePlanId || "unknown")
		const occupancyKey = String(item.labels.occupancyKey || "unknown")
		const date = String(item.labels.date || "unknown")
		const key = `${ratePlanId}|${occupancyKey}|${date}`
		const row = topMismatchMap.get(key) ?? {
			ratePlanId,
			occupancyKey,
			date,
			totalEvaluated: 0,
			mismatches: 0,
			missing: 0,
		}
		row.totalEvaluated += item.value
		topMismatchMap.set(key, row)
	}
	for (const item of mismatchEntries) {
		const key = `${String(item.labels.ratePlanId || "unknown")}|${String(item.labels.occupancyKey || "unknown")}|${String(item.labels.date || "unknown")}`
		const row = topMismatchMap.get(key)
		if (row) row.mismatches += item.value
	}
	for (const item of missingEntries) {
		const key = `${String(item.labels.ratePlanId || "unknown")}|${String(item.labels.occupancyKey || "unknown")}|${String(item.labels.date || "unknown")}`
		const row = topMismatchMap.get(key)
		if (row) row.missing += item.value
	}

	const causeMap = new Map<MismatchCause, number>()
	for (const item of causeEntries) {
		const cause = String(item.labels.cause || "missing_v2_row") as MismatchCause
		causeMap.set(cause, Number(causeMap.get(cause) ?? 0) + item.value)
	}
	const mismatchTotalForCause = Array.from(causeMap.values()).reduce((sum, value) => sum + value, 0)

	return {
		global: {
			totalEvaluated,
			matches,
			mismatches,
			missing,
			mismatchRatio: ratio(mismatches, totalEvaluated),
			missingRatio: ratio(missing, totalEvaluated),
			coverageV2Pct,
		},
		byOccupancyKey: Array.from(byOccupancyMap.entries())
			.map(([occupancyKey, item]) => ({
				occupancyKey,
				totalEvaluated: item.totalEvaluated,
				matches: item.matches,
				mismatches: item.mismatches,
				missing: item.missing,
				mismatchRatio: ratio(item.mismatches, item.totalEvaluated),
				missingRatio: ratio(item.missing, item.totalEvaluated),
				coverageV2Pct: Number(
					((item.totalEvaluated - item.missing) / Math.max(1, item.totalEvaluated)).toFixed(6)
				),
			}))
			.sort((a, b) => b.totalEvaluated - a.totalEvaluated),
		byRatePlanId: Array.from(byRatePlanMap.entries())
			.map(([ratePlanId, item]) => ({
				ratePlanId,
				totalEvaluated: item.totalEvaluated,
				matches: item.matches,
				mismatches: item.mismatches,
				missing: item.missing,
				mismatchRatio: ratio(item.mismatches, item.totalEvaluated),
				missingRatio: ratio(item.missing, item.totalEvaluated),
			}))
			.sort((a, b) => b.totalEvaluated - a.totalEvaluated),
		mismatchCauses: Array.from(causeMap.entries())
			.map(([cause, total]) => ({
				cause,
				total,
				ratio: ratio(total, mismatchTotalForCause),
			}))
			.sort((a, b) => b.total - a.total),
		topMismatches: Array.from(topMismatchMap.values())
			.map((item) => ({
				...item,
				mismatchRatio: ratio(item.mismatches, item.totalEvaluated),
				missingRatio: ratio(item.missing, item.totalEvaluated),
				coverageV2Pct: Number(
					((item.totalEvaluated - item.missing) / Math.max(1, item.totalEvaluated)).toFixed(6)
				),
			}))
			.filter((item) => item.mismatches > 0 || item.missing > 0)
			.sort((a, b) => b.mismatches + b.missing - (a.mismatches + a.missing))
			.slice(0, 20),
	}
}
