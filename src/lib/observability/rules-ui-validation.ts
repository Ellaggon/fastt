import { incrementCounter, readCounter } from "./metrics"
import { logger } from "./logger"

export type RulesUiMismatchCategory = "cancellation" | "payment" | "no_show" | "check_in"
export type RulesUiMismatchSeverity = "CRITICAL" | "MEDIUM" | "LOW"

type GroupCounter = Map<string, number>
type GroupRates = Map<
	string,
	{ requests: number; enabled: number; fallback: number; mismatch: number }
>

type DailyBucket = {
	requests: number
	enabled: number
	fallback: number
	mismatch: number
	mismatchByCategory: GroupCounter
	mismatchByHotel: GroupCounter
	mismatchBySupplier: GroupCounter
	mismatchByRatePlan: GroupCounter
	ratesByHotel: GroupRates
	ratesBySupplier: GroupRates
	ratesByRatePlan: GroupRates
	ratesByCategory: GroupRates
	missingPoliciesByContext: GroupCounter
	missingPoliciesTotal: number
}

type RulesValidationState = {
	byDay: Map<string, DailyBucket>
	alerted: Set<string>
}

function getState(): RulesValidationState {
	const g = globalThis as unknown as { __rulesUiValidationState?: RulesValidationState }
	if (!g.__rulesUiValidationState) {
		g.__rulesUiValidationState = {
			byDay: new Map(),
			alerted: new Set(),
		}
	}
	return g.__rulesUiValidationState
}

function runSafe(operation: string, fn: () => void): void {
	try {
		fn()
	} catch (error) {
		try {
			logger.warn("rules.ui.validation.safe_error", { operation, error })
		} catch {
			// Never break SSR rendering because of observability.
		}
	}
}

function dayKey(ts: Date = new Date()): string {
	return ts.toISOString().slice(0, 10)
}

function pct(part: number, total: number): number {
	if (total <= 0) return 0
	return Number(((part / total) * 100).toFixed(4))
}

function ensureBucket(key: string): DailyBucket {
	const state = getState()
	const existing = state.byDay.get(key)
	if (existing) return existing
	const next: DailyBucket = {
		requests: 0,
		enabled: 0,
		fallback: 0,
		mismatch: 0,
		mismatchByCategory: new Map(),
		mismatchByHotel: new Map(),
		mismatchBySupplier: new Map(),
		mismatchByRatePlan: new Map(),
		ratesByHotel: new Map(),
		ratesBySupplier: new Map(),
		ratesByRatePlan: new Map(),
		ratesByCategory: new Map(),
		missingPoliciesByContext: new Map(),
		missingPoliciesTotal: 0,
	}
	state.byDay.set(key, next)
	return next
}

function addCount(map: GroupCounter, key: string, delta = 1): void {
	const safe = String(key ?? "").trim()
	if (!safe) return
	map.set(safe, Number(map.get(safe) ?? 0) + delta)
}

function addRates(
	map: GroupRates,
	key: string,
	delta: Partial<{ requests: number; enabled: number; fallback: number; mismatch: number }>
): void {
	const safe = String(key ?? "").trim()
	if (!safe) return
	const current = map.get(safe) ?? { requests: 0, enabled: 0, fallback: 0, mismatch: 0 }
	current.requests += Number(delta.requests ?? 0)
	current.enabled += Number(delta.enabled ?? 0)
	current.fallback += Number(delta.fallback ?? 0)
	current.mismatch += Number(delta.mismatch ?? 0)
	map.set(safe, current)
}

function topEntries(map: GroupCounter, limit = 10): Array<{ key: string; count: number }> {
	return [...map.entries()]
		.map(([key, count]) => ({ key, count: Number(count) }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
		.slice(0, limit)
}

function maybeEmitDailyAlerts(day: string, bucket: DailyBucket): void {
	const state = getState()
	const mismatchRate = pct(bucket.mismatch, Math.max(1, bucket.requests))
	const fallbackRate = pct(bucket.fallback, Math.max(1, bucket.requests))
	const checks: Array<{
		code: string
		triggered: boolean
		level: "warning" | "critical"
		message: string
	}> = [
		{
			code: "rules_ui_mismatch_warning",
			triggered: mismatchRate > 2,
			level: "warning",
			message: `Mismatch rate ${mismatchRate}% > 2%`,
		},
		{
			code: "rules_ui_mismatch_critical",
			triggered: mismatchRate > 5,
			level: "critical",
			message: `Mismatch rate ${mismatchRate}% > 5%`,
		},
		{
			code: "rules_ui_fallback_investigate",
			triggered: fallbackRate > 3,
			level: "warning",
			message: `Fallback rate ${fallbackRate}% > 3%`,
		},
	]
	for (const check of checks) {
		if (!check.triggered) continue
		const alertKey = `${day}:${check.code}`
		if (state.alerted.has(alertKey)) continue
		state.alerted.add(alertKey)
		logger.warn("rules.ui.alert", {
			day,
			code: check.code,
			level: check.level,
			message: check.message,
			requests: bucket.requests,
			enabled: bucket.enabled,
			fallback: bucket.fallback,
			mismatch: bucket.mismatch,
			mismatchRatePct: mismatchRate,
			fallbackRatePct: fallbackRate,
		})
	}
}

export function classifyRulesUiMismatchSeverity(input: {
	category: string
	type: string
	details?: string
}): RulesUiMismatchSeverity {
	const category = String(input.category ?? "")
		.trim()
		.toLowerCase()
	const details = String(input.details ?? "")
		.trim()
		.toLowerCase()
	if (category === "cancellation" || category === "payment") return "CRITICAL"
	if (
		details.includes("date") ||
		details.includes("timing") ||
		details.includes("effective") ||
		details.includes("arrival") ||
		details.includes("departure")
	) {
		return "MEDIUM"
	}
	return "LOW"
}

export function recordRulesUiEvaluation(params: {
	endpoint: string
	hotelId?: string | null
	supplierId?: string | null
	ratePlanId?: string | null
	sessionHash: string
	enabled: boolean
	rolloutPercentage: number
	rolloutBucket: number | null
	timestamp?: Date
}): void {
	runSafe("recordRulesUiEvaluation", () => {
		const day = dayKey(params.timestamp)
		const bucket = ensureBucket(day)
		bucket.requests += 1
		if (params.enabled) bucket.enabled += 1
		addRates(bucket.ratesByHotel, String(params.hotelId ?? "unknown"), {
			requests: 1,
			enabled: params.enabled ? 1 : 0,
		})
		addRates(bucket.ratesBySupplier, String(params.supplierId ?? "unknown"), {
			requests: 1,
			enabled: params.enabled ? 1 : 0,
		})
		addRates(bucket.ratesByRatePlan, String(params.ratePlanId ?? "unknown"), {
			requests: 1,
			enabled: params.enabled ? 1 : 0,
		})

		incrementCounter("rules.ui.requests_total", { endpoint: params.endpoint })
		incrementCounter("rules.ui.requests_total")
		if (params.enabled) incrementCounter("rules.ui.enabled_total", { endpoint: params.endpoint })
		if (params.enabled) incrementCounter("rules.ui.enabled_total")

		logger.info("rules.ui.evaluation", {
			endpoint: params.endpoint,
			hotelId: params.hotelId ?? null,
			supplierId: params.supplierId ?? null,
			ratePlanId: params.ratePlanId ?? null,
			userSessionHash: params.sessionHash,
			enabled: params.enabled,
			rolloutPercentage: params.rolloutPercentage,
			rolloutBucket: params.rolloutBucket,
		})
		maybeEmitDailyAlerts(day, bucket)
	})
}

export function recordRulesUiFallback(params: {
	endpoint: string
	hotelId?: string | null
	supplierId?: string | null
	ratePlanId?: string | null
	sessionHash: string
	reason: "missing_rule_snapshot" | "mapper_error" | "mismatch_detected" | "unknown"
	timestamp?: Date
}): void {
	runSafe("recordRulesUiFallback", () => {
		const day = dayKey(params.timestamp)
		const bucket = ensureBucket(day)
		bucket.fallback += 1
		addRates(bucket.ratesByHotel, String(params.hotelId ?? "unknown"), { fallback: 1 })
		addRates(bucket.ratesBySupplier, String(params.supplierId ?? "unknown"), { fallback: 1 })
		addRates(bucket.ratesByRatePlan, String(params.ratePlanId ?? "unknown"), { fallback: 1 })

		incrementCounter("rules.ui.fallback_total", {
			endpoint: params.endpoint,
			reason: params.reason,
		})
		incrementCounter("rules.ui.fallback_total")
		logger.warn("rules.ui.fallback_used", {
			endpoint: params.endpoint,
			hotelId: params.hotelId ?? null,
			supplierId: params.supplierId ?? null,
			ratePlanId: params.ratePlanId ?? null,
			userSessionHash: params.sessionHash,
			reason: params.reason,
		})
		maybeEmitDailyAlerts(day, bucket)
	})
}

export function recordRulesUiDecisionTrace(params: {
	endpoint: string
	inputContext: {
		hotelId?: string | null
		ratePlanId?: string | null
		supplierId?: string | null
		variantId?: string | null
		channel?: string | null
		occupancy?: number | null
		checkIn?: string | null
		checkOut?: string | null
	}
	policiesResolved: Array<{
		category: string
		resolvedFromScope?: string | null
		policyId?: string | null
		version?: number | null
	}>
	requiredCategories: string[]
	policiesByCategory: Record<string, number>
	rulesFound: number
	rulesMatched: number
	rulesEvaluated: Array<{
		category: string
		code?: string | null
		layer?: string | null
		source?: string | null
		resolvedFromScope?: string | null
		version?: number | null
	}>
	finalOutput: Record<string, unknown>
	fallbackReason: string | null
}): void {
	runSafe("recordRulesUiDecisionTrace", () => {
		const day = dayKey()
		const bucket = ensureBucket(day)
		if (!Array.isArray(params.policiesResolved) || params.policiesResolved.length === 0) {
			const hotelId = String(params.inputContext.hotelId ?? "unknown")
			const ratePlanId = String(params.inputContext.ratePlanId ?? "unknown")
			const channel = String(params.inputContext.channel ?? "unknown")
			const key = `${hotelId}|${ratePlanId}|${channel}`
			addCount(bucket.missingPoliciesByContext, key)
			bucket.missingPoliciesTotal += 1
			const top = topEntries(bucket.missingPoliciesByContext, 20).map((entry) => {
				const [h, rp, ch] = entry.key.split("|")
				return {
					hotelId: h || "unknown",
					ratePlanId: rp || "unknown",
					channel: ch || "unknown",
					count: entry.count,
				}
			})
			logger.warn("rules.ui.missing_policies_summary", {
				day,
				totalMissingPolicies: bucket.missingPoliciesTotal,
				topContexts: top,
			})
		}
		logger.info("rules.ui.decision_trace", {
			endpoint: params.endpoint,
			inputContext: params.inputContext,
			policiesResolved: params.policiesResolved,
			requiredCategories: params.requiredCategories,
			policiesByCategory: params.policiesByCategory,
			rulesFound: params.rulesFound,
			rulesMatched: params.rulesMatched,
			rulesEvaluated: params.rulesEvaluated,
			finalOutput: params.finalOutput,
			fallbackReason: params.fallbackReason,
		})
	})
}

export function recordRulesUiMismatch(params: {
	endpoint: string
	hotelId?: string | null
	supplierId?: string | null
	ratePlanId?: string | null
	sessionHash: string
	input: {
		checkIn?: string | null
		checkOut?: string | null
		variantId?: string | null
		channel?: string | null
	}
	mismatches: Array<{ category: string; type: string; details: string }>
	policySnapshot: unknown
	ruleSnapshot: unknown
	timestamp?: Date
}): void {
	runSafe("recordRulesUiMismatch", () => {
		const day = dayKey(params.timestamp)
		const bucket = ensureBucket(day)
		bucket.mismatch += 1
		addCount(bucket.mismatchByHotel, String(params.hotelId ?? "unknown"))
		addCount(bucket.mismatchBySupplier, String(params.supplierId ?? "unknown"))
		addCount(bucket.mismatchByRatePlan, String(params.ratePlanId ?? "unknown"))
		addRates(bucket.ratesByHotel, String(params.hotelId ?? "unknown"), { mismatch: 1 })
		addRates(bucket.ratesBySupplier, String(params.supplierId ?? "unknown"), { mismatch: 1 })
		addRates(bucket.ratesByRatePlan, String(params.ratePlanId ?? "unknown"), { mismatch: 1 })

		const categories = new Set<RulesUiMismatchCategory>()
		const severities = new Set<RulesUiMismatchSeverity>()
		for (const mismatch of params.mismatches) {
			const normalized = String(mismatch.category ?? "")
				.trim()
				.toLowerCase()
			if (
				normalized === "cancellation" ||
				normalized === "payment" ||
				normalized === "no_show" ||
				normalized === "check_in"
			) {
				categories.add(normalized)
				addCount(bucket.mismatchByCategory, normalized)
				addRates(bucket.ratesByCategory, normalized, { requests: 1, mismatch: 1 })
			}
			const severity = classifyRulesUiMismatchSeverity(mismatch)
			severities.add(severity)
			incrementCounter("rules.ui.mismatch_total", {
				endpoint: params.endpoint,
				category: normalized || "unknown",
				severity,
			})
			incrementCounter("rules.ui.mismatch_total")
		}
		const sortedSeverity = [...severities].sort((a, b) => {
			const rank = { CRITICAL: 3, MEDIUM: 2, LOW: 1 }
			return rank[b] - rank[a]
		})

		logger.warn("rules.ui.mismatch_detected", {
			endpoint: params.endpoint,
			hotelId: params.hotelId ?? null,
			supplierId: params.supplierId ?? null,
			ratePlanId: params.ratePlanId ?? null,
			userSessionHash: params.sessionHash,
			severity: sortedSeverity[0] ?? "LOW",
			mismatchCategories: [...categories],
			mismatches: params.mismatches,
			reproducibleInput: params.input,
			policySnapshot: params.policySnapshot,
			ruleSnapshot: params.ruleSnapshot,
		})
		maybeEmitDailyAlerts(day, bucket)
	})
}

export function getRulesUiDailySummary(day?: string): {
	day: string
	totalRequests: number
	rulesEnabledPct: number
	fallbackPct: number
	mismatchPct: number
	topMismatchCategories: Array<{ category: string; count: number }>
	topAffectedHotels: Array<{ hotelId: string; count: number }>
	topAffectedSuppliers: Array<{ supplierId: string; count: number }>
	topAffectedRatePlans: Array<{ ratePlanId: string; count: number }>
	byRates: {
		rulesUiEnabledRate: number
		rulesUiFallbackRate: number
		rulesUiMismatchRate: number
		byHotel: Array<{
			hotelId: string
			requests: number
			enabledRatePct: number
			fallbackRatePct: number
			mismatchRatePct: number
		}>
		bySupplier: Array<{
			supplierId: string
			requests: number
			enabledRatePct: number
			fallbackRatePct: number
			mismatchRatePct: number
		}>
		byRatePlan: Array<{
			ratePlanId: string
			requests: number
			enabledRatePct: number
			fallbackRatePct: number
			mismatchRatePct: number
		}>
		byCategory: Array<{
			category: string
			requests: number
			mismatchRatePct: number
		}>
	}
} {
	const key = String(day ?? dayKey()).trim()
	const bucket = getState().byDay.get(key) ?? ensureBucket(key)
	const totalRequests = Number(bucket.requests)
	const rulesEnabledPct = pct(bucket.enabled, Math.max(1, totalRequests))
	const fallbackPct = pct(bucket.fallback, Math.max(1, totalRequests))
	const mismatchPct = pct(bucket.mismatch, Math.max(1, totalRequests))
	const mapRates = (
		map: GroupRates,
		label: "hotelId" | "supplierId" | "ratePlanId" | "category"
	): Array<Record<string, number | string>> =>
		[...map.entries()]
			.map(([key, value]) => ({
				[label]: key,
				requests: value.requests,
				enabledRatePct: pct(value.enabled, Math.max(1, value.requests)),
				fallbackRatePct: pct(value.fallback, Math.max(1, value.requests)),
				mismatchRatePct: pct(value.mismatch, Math.max(1, value.requests)),
			}))
			.sort(
				(a, b) =>
					Number(b.requests) - Number(a.requests) ||
					String(a[label]).localeCompare(String(b[label]))
			)
			.slice(0, 20)

	return {
		day: key,
		totalRequests,
		rulesEnabledPct,
		fallbackPct,
		mismatchPct,
		topMismatchCategories: topEntries(bucket.mismatchByCategory).map((entry) => ({
			category: entry.key,
			count: entry.count,
		})),
		topAffectedHotels: topEntries(bucket.mismatchByHotel).map((entry) => ({
			hotelId: entry.key,
			count: entry.count,
		})),
		topAffectedSuppliers: topEntries(bucket.mismatchBySupplier).map((entry) => ({
			supplierId: entry.key,
			count: entry.count,
		})),
		topAffectedRatePlans: topEntries(bucket.mismatchByRatePlan).map((entry) => ({
			ratePlanId: entry.key,
			count: entry.count,
		})),
		byRates: {
			rulesUiEnabledRate: Number(
				(
					readCounter("rules.ui.enabled_total") /
					Math.max(1, readCounter("rules.ui.requests_total"))
				).toFixed(6)
			),
			rulesUiFallbackRate: Number(
				(
					readCounter("rules.ui.fallback_total") /
					Math.max(1, readCounter("rules.ui.requests_total"))
				).toFixed(6)
			),
			rulesUiMismatchRate: Number(
				(
					readCounter("rules.ui.mismatch_total") /
					Math.max(1, readCounter("rules.ui.requests_total"))
				).toFixed(6)
			),
			byHotel: mapRates(bucket.ratesByHotel, "hotelId") as Array<{
				hotelId: string
				requests: number
				enabledRatePct: number
				fallbackRatePct: number
				mismatchRatePct: number
			}>,
			bySupplier: mapRates(bucket.ratesBySupplier, "supplierId") as Array<{
				supplierId: string
				requests: number
				enabledRatePct: number
				fallbackRatePct: number
				mismatchRatePct: number
			}>,
			byRatePlan: mapRates(bucket.ratesByRatePlan, "ratePlanId") as Array<{
				ratePlanId: string
				requests: number
				enabledRatePct: number
				fallbackRatePct: number
				mismatchRatePct: number
			}>,
			byCategory: [...bucket.ratesByCategory.entries()]
				.map(([category, value]) => ({
					category,
					requests: value.requests,
					mismatchRatePct: pct(value.mismatch, Math.max(1, value.requests)),
				}))
				.sort((a, b) => b.requests - a.requests || a.category.localeCompare(b.category))
				.slice(0, 20),
		},
	}
}
