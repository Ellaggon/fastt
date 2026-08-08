/**
 * Tour vertical rollout counters, ratios, and alert evaluation.
 * Observe: hold→confirm, voucher redeem/issued, refund quote vs applied, failures by reason.
 * Counters dual-write to a shared store (process Map + Redis) with stage/cohort/provider-safe labels.
 */
import { createHash } from "node:crypto"
import { getFeatureFlag, type FeatureFlagContext } from "@/config/featureFlags"
import {
	getMetricsWindow,
	incrementCounter,
	listCountersByPrefix,
	parseCounterKey,
	readCounter,
} from "@/lib/observability/metrics"
import {
	evaluateTourCanary,
	getTourProviderAllowlist,
	getTourRolloutStage,
	isTourProviderAllowlisted,
	type TourCanarySubject,
	type TourRolloutStage,
	toFeatureFlagContext,
} from "@/lib/tours/tourRolloutCanary"
import {
	ensureTourRolloutStageDwell,
	evaluateDwellWindow,
	getSharedMetricsWindow,
	incrementSharedTourCounter,
	listSharedTourCounters,
	loadTourRolloutStageDwell,
	syncSharedTourCountersFromRedis,
} from "@/lib/tours/tourRolloutSharedStore"

export type { TourCanarySubject, TourRolloutStage } from "@/lib/tours/tourRolloutCanary"

export type TourMetricOutcome =
	| "success"
	| "failure"
	| "disabled"
	| "private_on_request"
	| "not_holdable"
	| "unauthorized"
	| "idempotent"
	| "not_found"
	| "not_tour"
	| "manual_review"
	| "amount_mismatch"
	| "recovered"

export type TourMetricCohort = "canary" | "control" | "unknown"

export type TourMetricContext = {
	stage?: TourRolloutStage
	cohort?: TourMetricCohort
	providerId?: string | null
	subject?: TourCanarySubject
}

export type TourRolloutThresholds = {
	/** Minimum successful confirms / successful holds (baseline floor). */
	minHoldToConfirmRate: number
	/** Max share of hold attempts that are hard failures (outcome=failure|not_holdable). */
	maxHoldFailureRate: number
	/** Minimum redeemed / issued vouchers. */
	minRedeemIssuedRate: number
	/** Max share of quoted refunds that were not applied. */
	maxRefundQuoteNotAppliedRate: number
	/** Ignore ratio alerts until this many holds (or confirms) exist. */
	minSampleSize: number
}

export type TourFailureBucket = {
	reason: string
	count: number
}

export type TourRolloutSummary = {
	window: { startedAtMs: number; uptimeMs: number }
	cohort: TourMetricCohort | "all"
	stage: TourRolloutStage
	holds: {
		total: number
		success: number
		failure: number
		byOutcome: Record<string, number>
		failuresByReason: TourFailureBucket[]
	}
	confirms: {
		total: number
		success: number
		failure: number
		byOutcome: Record<string, number>
		failuresByReason: TourFailureBucket[]
	}
	vouchers: {
		issued: number
		redeemed: number
		void: number
		byEvent: Record<string, number>
	}
	refunds: {
		quoted: number
		applied: number
		manualReview: number
		amountMismatch: number
		byOutcome: Record<string, number>
		failuresByReason: TourFailureBucket[]
	}
	search: {
		total: number
		byOutcome: Record<string, number>
	}
	ratios: {
		holdToConfirm: number
		redeemIssued: number
		refundQuoteApplied: number
		holdFailureRate: number
		confirmFailureRate: number
	}
}

export type TourRolloutHealth = {
	status: "healthy" | "degraded" | "insufficient_sample"
	isHealthy: boolean
	reasons: string[]
	thresholds: TourRolloutThresholds
	summary: TourRolloutSummary
	alerts: Array<{
		code: string
		severity: "warning" | "critical"
		message: string
	}>
}

const DEFAULT_THRESHOLDS: TourRolloutThresholds = {
	minHoldToConfirmRate: 0.55,
	maxHoldFailureRate: 0.35,
	minRedeemIssuedRate: 0.2,
	maxRefundQuoteNotAppliedRate: 0.25,
	minSampleSize: 20,
}

function parseEnvNumber(key: string, fallback: number): number {
	const raw = process.env[key]
	if (raw == null || String(raw).trim().length === 0) return fallback
	const parsed = Number(raw)
	return Number.isFinite(parsed) ? parsed : fallback
}

export function getTourRolloutThresholds(
	overrides?: Partial<TourRolloutThresholds>
): TourRolloutThresholds {
	return {
		minHoldToConfirmRate: parseEnvNumber(
			"TOURS_ROLLOUT_MIN_HOLD_CONFIRM_RATE",
			DEFAULT_THRESHOLDS.minHoldToConfirmRate
		),
		maxHoldFailureRate: parseEnvNumber(
			"TOURS_ROLLOUT_MAX_HOLD_FAILURE_RATE",
			DEFAULT_THRESHOLDS.maxHoldFailureRate
		),
		minRedeemIssuedRate: parseEnvNumber(
			"TOURS_ROLLOUT_MIN_REDEEM_ISSUED_RATE",
			DEFAULT_THRESHOLDS.minRedeemIssuedRate
		),
		maxRefundQuoteNotAppliedRate: parseEnvNumber(
			"TOURS_ROLLOUT_MAX_REFUND_QUOTE_GAP_RATE",
			DEFAULT_THRESHOLDS.maxRefundQuoteNotAppliedRate
		),
		minSampleSize: Math.max(
			1,
			Math.floor(parseEnvNumber("TOURS_ROLLOUT_MIN_SAMPLE_SIZE", DEFAULT_THRESHOLDS.minSampleSize))
		),
		...overrides,
	}
}

function resolveCanaryFlag(
	flagName:
		| "TOURS_CHECKOUT_ENABLED"
		| "TOURS_REFUND_HOURS_ENABLED"
		| "TOURS_CHECKIN_ENABLED"
		| "TOURS_PUBLIC_SEARCH_ENABLED",
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): boolean {
	const subject = (subjectOrContext ?? {}) as TourCanarySubject
	const flagContext =
		toFeatureFlagContext(subject) ?? (subjectOrContext as FeatureFlagContext | undefined)
	const killSwitch = getFeatureFlag(flagName, flagContext)
	return evaluateTourCanary({ killSwitchEnabled: killSwitch, subject }).enabled
}

/** Checkout canary: kill-switch + staging/allowlist/percentage/general. */
export function toursCheckoutEnabled(
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): boolean {
	return resolveCanaryFlag("TOURS_CHECKOUT_ENABLED", subjectOrContext)
}

export function toursRefundHoursEnabled(
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): boolean {
	return resolveCanaryFlag("TOURS_REFUND_HOURS_ENABLED", subjectOrContext)
}

export function toursCheckinEnabled(
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): boolean {
	return resolveCanaryFlag("TOURS_CHECKIN_ENABLED", subjectOrContext)
}

/**
 * Public search canary.
 * - allowlist: discovery stays on; callers must filter cards to allowlisted providers.
 * - percentage/staging/general: session subject bucket (not destination).
 */
export function toursPublicSearchEnabled(
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): boolean {
	const subject = (subjectOrContext ?? {}) as TourCanarySubject
	const flagContext =
		toFeatureFlagContext(subject) ?? (subjectOrContext as FeatureFlagContext | undefined)
	const killSwitch = getFeatureFlag("TOURS_PUBLIC_SEARCH_ENABLED", flagContext)
	if (!killSwitch) return false
	const stage = getTourRolloutStage(subject)
	if (stage === "allowlist") return true
	return evaluateTourCanary({ killSwitchEnabled: killSwitch, subject }).enabled
}

/** Filter discovery cards to allowlisted providers during allowlist canary. */
export function filterTourSearchCardsForCanary<T extends { providerId?: string | null }>(
	cards: T[],
	subject?: TourCanarySubject
): T[] {
	const stage = getTourRolloutStage(subject)
	if (stage !== "allowlist") return cards
	const allowlist = getTourProviderAllowlist(subject)
	if (allowlist.size === 0) return []
	return cards.filter((card) => isTourProviderAllowlisted(card.providerId, subject))
}

/** When refund-hours flag is off / outside canary, fall back to day-based cutoffs only. */
export function resolveTourHoursBeforeDeparture(
	hoursBeforeDeparture: number | null | undefined,
	subjectOrContext?: TourCanarySubject | FeatureFlagContext
): number | null {
	if (!toursRefundHoursEnabled(subjectOrContext)) return null
	if (hoursBeforeDeparture == null || !Number.isFinite(Number(hoursBeforeDeparture))) return null
	return Math.max(0, Number(hoursBeforeDeparture))
}

function sanitizeReason(reason: string | undefined, fallback: string): string {
	const raw = String(reason ?? fallback)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_.:-]+/g, "_")
		.slice(0, 80)
	return raw.length > 0 ? raw : fallback
}

/** Low-cardinality provider label for Prometheus (sha256 prefix). */
export function providerSafeLabel(providerId: string | null | undefined): string {
	const raw = String(providerId ?? "").trim()
	if (!raw) return "none"
	return createHash("sha256").update(raw).digest("hex").slice(0, 12)
}

export function resolveTourMetricContext(context?: TourMetricContext | TourCanarySubject): {
	stage: TourRolloutStage
	cohort: TourMetricCohort
	providerSafe: string
} {
	const subject =
		(context as TourMetricContext | undefined)?.subject ?? (context as TourCanarySubject)
	const explicit = context as TourMetricContext | undefined
	const stage = explicit?.stage ?? getTourRolloutStage(subject)
	const providerId = explicit?.providerId ?? subject?.providerId ?? null
	let cohort = explicit?.cohort
	if (!cohort) {
		const killSwitch = getFeatureFlag("TOURS_CHECKOUT_ENABLED", toFeatureFlagContext(subject))
		const decision = evaluateTourCanary({ killSwitchEnabled: killSwitch, subject })
		if (stage === "off" || stage === "general") cohort = "unknown"
		else cohort = decision.enabled ? "canary" : "control"
	}
	return {
		stage,
		cohort,
		providerSafe: providerSafeLabel(providerId),
	}
}

function metricKeyFrom(name: string, tags: Record<string, string>): string {
	const encoded = Object.entries(tags)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${String(v)}`)
		.join(",")
	return `${name}|${encoded}`
}

function recordTourCounter(
	name: string,
	tags: Record<string, string>,
	context?: TourMetricContext
): void {
	const dims = resolveTourMetricContext(context)
	const labeled = {
		...tags,
		stage: dims.stage,
		cohort: dims.cohort,
		provider_safe: dims.providerSafe,
	}
	incrementCounter(name, labeled)
	incrementSharedTourCounter(metricKeyFrom(name, labeled))
}

export function recordTourHold(
	outcome: TourMetricOutcome,
	reason?: string,
	context?: TourMetricContext
): void {
	recordTourCounter(
		"tours_hold_total",
		{ outcome, reason: sanitizeReason(reason, outcome) },
		context
	)
}

export function recordTourConfirm(
	outcome: TourMetricOutcome,
	reason?: string,
	context?: TourMetricContext
): void {
	recordTourCounter(
		"tours_confirm_total",
		{ outcome, reason: sanitizeReason(reason, outcome) },
		context
	)
}

export function recordTourVoucher(
	event: "issued" | "redeemed" | "void",
	outcome: TourMetricOutcome = "success",
	context?: TourMetricContext
): void {
	recordTourCounter("tours_voucher_total", { event, outcome }, context)
}

export function recordTourCheckIn(
	outcome: TourMetricOutcome,
	reason?: string,
	context?: TourMetricContext
): void {
	recordTourCounter(
		"tours_checkin_total",
		{ outcome, reason: sanitizeReason(reason, outcome) },
		context
	)
}

/** Refund ledger applied (or failed to apply) after a quote. */
export function recordTourRefund(
	outcome: TourMetricOutcome,
	reason?: string,
	context?: TourMetricContext
): void {
	recordTourCounter(
		"tours_refund_total",
		{ outcome, reason: sanitizeReason(reason, outcome) },
		context
	)
}

/** Refund quote created / blocked before cancellation apply. */
export function recordTourRefundQuote(
	outcome: TourMetricOutcome,
	reason?: string,
	context?: TourMetricContext
): void {
	recordTourCounter(
		"tours_refund_quote_total",
		{ outcome, reason: sanitizeReason(reason, outcome) },
		context
	)
}

export function recordTourSearch(
	outcome: "success" | "disabled" | "empty" | "error",
	context?: TourMetricContext
): void {
	recordTourCounter("tours_search_total", { outcome }, context)
}

function counterEntries(prefix: string): Array<{ key: string; value: number }> {
	const shared = listSharedTourCounters(prefix)
	if (shared.length > 0) return shared
	return listCountersByPrefix(prefix)
}

function sumByLabel(
	prefix: string,
	labelKey: string,
	filter?: { cohort?: TourMetricCohort | "all"; stage?: TourRolloutStage | "all" }
): { total: number; byLabel: Record<string, number> } {
	const byLabel: Record<string, number> = {}
	let total = 0
	for (const entry of counterEntries(prefix)) {
		const parsed = parseCounterKey(entry.key)
		if (parsed.name !== prefix) continue
		if (filter?.cohort && filter.cohort !== "all") {
			if (String(parsed.labels.cohort ?? "unknown") !== filter.cohort) continue
		}
		if (filter?.stage && filter.stage !== "all") {
			if (String(parsed.labels.stage ?? "off") !== filter.stage) continue
		}
		const label = String(parsed.labels[labelKey] ?? "unknown")
		byLabel[label] = (byLabel[label] ?? 0) + Number(entry.value)
		total += Number(entry.value)
	}
	return { total, byLabel }
}

function failuresByReason(
	prefix: string,
	failureOutcomes: Set<string>,
	filter?: { cohort?: TourMetricCohort | "all"; stage?: TourRolloutStage | "all" }
): TourFailureBucket[] {
	const map = new Map<string, number>()
	for (const entry of counterEntries(prefix)) {
		const parsed = parseCounterKey(entry.key)
		if (parsed.name !== prefix) continue
		if (filter?.cohort && filter.cohort !== "all") {
			if (String(parsed.labels.cohort ?? "unknown") !== filter.cohort) continue
		}
		if (filter?.stage && filter.stage !== "all") {
			if (String(parsed.labels.stage ?? "off") !== filter.stage) continue
		}
		const outcome = String(parsed.labels.outcome ?? "")
		if (!failureOutcomes.has(outcome)) continue
		const reason = String(parsed.labels.reason ?? outcome).trim() || "unknown"
		map.set(reason, (map.get(reason) ?? 0) + Number(entry.value))
	}
	return [...map.entries()]
		.map(([reason, count]) => ({ reason, count }))
		.sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

function safeRate(numerator: number, denominator: number): number {
	if (denominator <= 0) return 0
	return Number((numerator / denominator).toFixed(6))
}

export function buildTourRolloutSummary(input?: {
	cohort?: TourMetricCohort | "all"
	stage?: TourRolloutStage | "all"
}): TourRolloutSummary {
	const filter = {
		cohort: input?.cohort ?? "all",
		stage: input?.stage ?? "all",
	}
	const holds = sumByLabel("tours_hold_total", "outcome", filter)
	const confirms = sumByLabel("tours_confirm_total", "outcome", filter)
	const vouchers = sumByLabel("tours_voucher_total", "event", filter)
	const refunds = sumByLabel("tours_refund_total", "outcome", filter)
	const refundQuotes = sumByLabel("tours_refund_quote_total", "outcome", filter)
	const search = sumByLabel("tours_search_total", "outcome", filter)

	const holdSuccess = holds.byLabel.success ?? 0
	const holdFailure = (holds.byLabel.failure ?? 0) + (holds.byLabel.not_holdable ?? 0)
	const confirmSuccess = confirms.byLabel.success ?? 0
	const confirmFailure = confirms.byLabel.failure ?? 0
	const issued = vouchers.byLabel.issued ?? 0
	const redeemed = vouchers.byLabel.redeemed ?? 0
	const quoted =
		(refundQuotes.byLabel.success ?? 0) +
		(refundQuotes.byLabel.manual_review ?? 0) +
		(refundQuotes.byLabel.failure ?? 0)
	const applied = refunds.byLabel.success ?? 0
	const manualReview = refundQuotes.byLabel.manual_review ?? 0
	const amountMismatch = refunds.byLabel.amount_mismatch ?? 0
	const sharedWindow = getSharedMetricsWindow()
	const processWindow = getMetricsWindow()

	return {
		window: {
			startedAtMs: Math.min(sharedWindow.startedAtMs, processWindow.startedAtMs),
			uptimeMs: Math.max(sharedWindow.uptimeMs, processWindow.uptimeMs),
		},
		cohort: filter.cohort,
		stage: filter.stage === "all" ? getTourRolloutStage() : filter.stage,
		holds: {
			total: holds.total,
			success: holdSuccess,
			failure: holdFailure,
			byOutcome: holds.byLabel,
			failuresByReason: failuresByReason(
				"tours_hold_total",
				new Set(["failure", "not_holdable", "disabled", "private_on_request"]),
				filter
			),
		},
		confirms: {
			total: confirms.total,
			success: confirmSuccess,
			failure: confirmFailure,
			byOutcome: confirms.byLabel,
			failuresByReason: failuresByReason(
				"tours_confirm_total",
				new Set(["failure", "disabled", "unauthorized"]),
				filter
			),
		},
		vouchers: {
			issued,
			redeemed,
			void: vouchers.byLabel.void ?? 0,
			byEvent: vouchers.byLabel,
		},
		refunds: {
			quoted,
			applied,
			manualReview,
			amountMismatch,
			byOutcome: {
				...refundQuotes.byLabel,
				applied_success: applied,
				applied_failure: refunds.byLabel.failure ?? 0,
			},
			failuresByReason: [
				...failuresByReason(
					"tours_refund_quote_total",
					new Set(["failure", "manual_review"]),
					filter
				),
				...failuresByReason("tours_refund_total", new Set(["failure", "amount_mismatch"]), filter),
			].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
		},
		search: {
			total: search.total,
			byOutcome: search.byLabel,
		},
		ratios: {
			holdToConfirm: safeRate(confirmSuccess, holdSuccess),
			redeemIssued: safeRate(redeemed, issued),
			refundQuoteApplied: safeRate(applied, Math.max(quoted, 1) > 0 ? quoted : 0),
			holdFailureRate: safeRate(holdFailure, holds.total),
			confirmFailureRate: safeRate(confirmFailure, confirms.total),
		},
	}
}

export function buildTourRolloutCohortComparison(): {
	canary: TourRolloutSummary
	control: TourRolloutSummary
	all: TourRolloutSummary
} {
	return {
		canary: buildTourRolloutSummary({ cohort: "canary" }),
		control: buildTourRolloutSummary({ cohort: "control" }),
		all: buildTourRolloutSummary({ cohort: "all" }),
	}
}

export function evaluateTourRolloutHealth(input?: {
	summary?: TourRolloutSummary
	thresholds?: Partial<TourRolloutThresholds>
}): TourRolloutHealth {
	const thresholds = getTourRolloutThresholds(input?.thresholds)
	const summary = input?.summary ?? buildTourRolloutSummary({ cohort: "canary" })
	// Fall back to all traffic when canary cohort has no samples yet.
	const effectiveSummary =
		summary.holds.total + summary.confirms.total > 0
			? summary
			: buildTourRolloutSummary({ cohort: "all" })
	const sample = Math.max(
		effectiveSummary.holds.success,
		effectiveSummary.confirms.success,
		effectiveSummary.holds.total
	)
	const reasons: string[] = []
	const alerts: TourRolloutHealth["alerts"] = []

	if (sample < thresholds.minSampleSize) {
		return {
			status: "insufficient_sample",
			isHealthy: false,
			reasons: [`sample ${sample} < minSampleSize ${thresholds.minSampleSize}`],
			thresholds,
			summary: effectiveSummary,
			alerts: [],
		}
	}

	if (effectiveSummary.ratios.holdToConfirm < thresholds.minHoldToConfirmRate) {
		const message = `hold_to_confirm ${effectiveSummary.ratios.holdToConfirm.toFixed(4)} < baseline ${thresholds.minHoldToConfirmRate.toFixed(4)}`
		reasons.push(message)
		alerts.push({ code: "tours_hold_confirm_below_baseline", severity: "critical", message })
	}
	if (effectiveSummary.ratios.holdFailureRate > thresholds.maxHoldFailureRate) {
		const message = `hold_failure_rate ${effectiveSummary.ratios.holdFailureRate.toFixed(4)} > ${thresholds.maxHoldFailureRate.toFixed(4)}`
		reasons.push(message)
		alerts.push({ code: "tours_hold_failure_rate_high", severity: "critical", message })
	}
	if (effectiveSummary.vouchers.issued >= thresholds.minSampleSize) {
		if (effectiveSummary.ratios.redeemIssued < thresholds.minRedeemIssuedRate) {
			const message = `redeem_issued ${effectiveSummary.ratios.redeemIssued.toFixed(4)} < baseline ${thresholds.minRedeemIssuedRate.toFixed(4)}`
			reasons.push(message)
			alerts.push({ code: "tours_redeem_issued_below_baseline", severity: "warning", message })
		}
	}
	if (effectiveSummary.refunds.quoted >= Math.max(5, Math.floor(thresholds.minSampleSize / 4))) {
		const gapRate = 1 - effectiveSummary.ratios.refundQuoteApplied
		if (gapRate > thresholds.maxRefundQuoteNotAppliedRate) {
			const message = `refund_quote_gap ${gapRate.toFixed(4)} > ${thresholds.maxRefundQuoteNotAppliedRate.toFixed(4)}`
			reasons.push(message)
			alerts.push({
				code: "tours_refund_quote_vs_applied_gap",
				severity: "warning",
				message,
			})
		}
	}
	if (effectiveSummary.refunds.amountMismatch > 0) {
		const message = `refund_amount_mismatch_total ${effectiveSummary.refunds.amountMismatch}`
		reasons.push(message)
		alerts.push({ code: "tours_refund_amount_mismatch", severity: "critical", message })
	}
	if ((effectiveSummary.search.byOutcome.error ?? 0) > 0) {
		const message = `tours_search_errors ${effectiveSummary.search.byOutcome.error}`
		reasons.push(message)
		alerts.push({ code: "tours_search_errors", severity: "warning", message })
	}

	const status = reasons.length > 0 ? "degraded" : "healthy"
	return {
		status,
		isHealthy: status === "healthy",
		reasons,
		thresholds,
		summary: effectiveSummary,
		alerts,
	}
}

/** Prometheus gauges derived from shared counters (scraped with /prometheus). */
export function collectTourRolloutPrometheusMetrics(): Array<{
	name: string
	labels?: Record<string, string>
	value: number
}> {
	const comparison = buildTourRolloutCohortComparison()
	const health = evaluateTourRolloutHealth({ summary: comparison.canary })
	const { summary, thresholds } = health
	const out: Array<{ name: string; labels?: Record<string, string>; value: number }> = []

	for (const [cohort, cohortSummary] of Object.entries(comparison) as Array<
		[string, TourRolloutSummary]
	>) {
		out.push({
			name: "tours_rollout_hold_to_confirm_ratio",
			labels: { cohort },
			value: cohortSummary.ratios.holdToConfirm,
		})
		out.push({
			name: "tours_rollout_redeem_issued_ratio",
			labels: { cohort },
			value: cohortSummary.ratios.redeemIssued,
		})
		out.push({
			name: "tours_rollout_refund_quote_applied_ratio",
			labels: { cohort },
			value: cohortSummary.ratios.refundQuoteApplied,
		})
		out.push({
			name: "tours_rollout_hold_failure_ratio",
			labels: { cohort },
			value: cohortSummary.ratios.holdFailureRate,
		})
		out.push({
			name: "tours_rollout_confirm_failure_ratio",
			labels: { cohort },
			value: cohortSummary.ratios.confirmFailureRate,
		})
	}

	out.push(
		{
			name: "tours_rollout_health",
			labels: { status: health.status },
			value: health.isHealthy ? 1 : 0,
		},
		{
			name: "tours_rollout_alert_firing",
			labels: {},
			value: health.alerts.length,
		},
		{
			name: "tours_rollout_baseline_min_hold_confirm_rate",
			value: thresholds.minHoldToConfirmRate,
		},
		{
			name: "tours_rollout_baseline_min_redeem_issued_rate",
			value: thresholds.minRedeemIssuedRate,
		}
	)
	for (const alert of health.alerts) {
		out.push({
			name: "tours_rollout_alert",
			labels: { code: alert.code, severity: alert.severity },
			value: 1,
		})
	}
	for (const bucket of summary.holds.failuresByReason.slice(0, 20)) {
		out.push({
			name: "tours_hold_failures_by_reason",
			labels: { reason: bucket.reason },
			value: bucket.count,
		})
	}
	for (const bucket of summary.confirms.failuresByReason.slice(0, 20)) {
		out.push({
			name: "tours_confirm_failures_by_reason",
			labels: { reason: bucket.reason },
			value: bucket.count,
		})
	}
	return out
}

/** Test helper: read a specific tagged counter. */
export function readTourCounter(
	name:
		| "tours_hold_total"
		| "tours_confirm_total"
		| "tours_voucher_total"
		| "tours_refund_total"
		| "tours_refund_quote_total"
		| "tours_search_total"
		| "tours_checkin_total",
	tags: Record<string, string>
): number {
	return readCounter(name, tags)
}

export type TourExpansionGate = {
	expand: boolean
	stage: TourRolloutStage
	health: TourRolloutHealth
	blockers: string[]
	dwell: {
		ready: boolean
		minDwellMs: number
		elapsedMs: number
		remainingMs: number
		enteredAtMs: number
	}
}

/**
 * Observation gate before expanding canary (allowlist → % → general).
 * Requires healthy status (not insufficient_sample), release baselines, and dwell window.
 */
export function evaluateTourRolloutExpansionGate(input?: {
	subject?: TourCanarySubject
	health?: TourRolloutHealth
	nowMs?: number
}): TourExpansionGate {
	const stage = getTourRolloutStage(input?.subject)
	const health = input?.health ?? evaluateTourRolloutHealth()
	const dwellState = ensureTourRolloutStageDwell(stage, input?.subject?.env)
	const dwell = evaluateDwellWindow({
		stage,
		enteredAtMs: dwellState.enteredAtMs,
		nowMs: input?.nowMs,
		env: input?.subject?.env,
	})
	const blockers: string[] = []

	if (health.status === "insufficient_sample") {
		blockers.push(...health.reasons)
	}
	if (health.status === "degraded") {
		blockers.push(...health.reasons)
	}
	if (!dwell.ready) {
		blockers.push(
			`dwell_remaining_ms ${dwell.remainingMs} (min ${dwell.minDwellMs} since stage ${stage})`
		)
	}
	const releaseCodes = new Set([
		"tours_hold_confirm_below_baseline",
		"tours_hold_failure_rate_high",
		"tours_refund_amount_mismatch",
		"tours_refund_quote_vs_applied_gap",
		"tours_redeem_issued_below_baseline",
	])
	for (const alert of health.alerts) {
		if (releaseCodes.has(alert.code) || alert.severity === "critical") {
			blockers.push(alert.message)
		}
	}
	return {
		expand: blockers.length === 0 && health.status === "healthy" && dwell.ready,
		stage,
		health,
		blockers: [...new Set(blockers)],
		dwell: {
			...dwell,
			enteredAtMs: dwellState.enteredAtMs,
		},
	}
}

/** Async gate used by HTTP handlers: hydrate Redis then evaluate. */
export async function evaluateTourRolloutExpansionGateAsync(input?: {
	subject?: TourCanarySubject
	thresholds?: Partial<TourRolloutThresholds>
}): Promise<TourExpansionGate> {
	await syncSharedTourCountersFromRedis()
	const stage = getTourRolloutStage(input?.subject)
	await loadTourRolloutStageDwell(stage, input?.subject?.env)
	const health = evaluateTourRolloutHealth({ thresholds: input?.thresholds })
	return evaluateTourRolloutExpansionGate({ subject: input?.subject, health })
}
