import { roundMoney } from "./pricing.utils"

export type CanonicalPriceRule = {
	id: string
	type: string
	value: number
	occupancyKey?: string | null
	priority?: number | null
	createdAt?: Date | string | null
	isActive?: boolean | null
	dateRange?: { from?: string | null; to?: string | null } | null
	dayOfWeek?: number[] | null
}

type EvaluateParams = {
	basePrice: number
	date: string
	occupancyKey?: string | null
	ratePlanId?: string
	rules: CanonicalPriceRule[]
	includeBreakdown?: boolean
}

type EvaluateResult = {
	price: number
	appliedRuleIds: string[]
	breakdown?: Array<{
		ruleId: string
		type: string
		value: number
		priority: number
		before: number
		after: number
		delta: number
	}>
}

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function normalizeDayOfWeek(dayOfWeek: unknown): number[] | null {
	if (!Array.isArray(dayOfWeek)) return null
	const days = dayOfWeek
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
	return days.length > 0 ? days : null
}

function isRuleApplicableForDate(rule: CanonicalPriceRule, date: string): boolean {
	const dateValue = parseDateOnly(date)
	if (Number.isNaN(dateValue.getTime())) return false

	const range = rule.dateRange ?? null
	if (range?.from) {
		const fromValue = parseDateOnly(String(range.from))
		if (Number.isNaN(fromValue.getTime())) return false
		if (dateValue < fromValue) return false
	}
	if (range?.to) {
		const toValue = parseDateOnly(String(range.to))
		if (Number.isNaN(toValue.getTime())) return false
		if (dateValue > toValue) return false
	}

	const allowedDays = normalizeDayOfWeek(rule.dayOfWeek)
	if (allowedDays && !allowedDays.includes(dateValue.getUTCDay())) return false

	return true
}

function isRuleApplicableForOccupancy(
	rule: CanonicalPriceRule,
	occupancyKey?: string | null
): boolean {
	const ruleScope = String(rule.occupancyKey ?? "").trim()
	if (!ruleScope) return true
	return ruleScope === String(occupancyKey ?? "").trim()
}

function normalizeRulePriority(rule: CanonicalPriceRule): number {
	const value = Number(rule.priority ?? 10)
	return Number.isFinite(value) ? value : 10
}

function normalizeRuleCreatedAt(rule: CanonicalPriceRule): string {
	if (!rule.createdAt) return ""
	if (rule.createdAt instanceof Date) return toDateOnly(rule.createdAt)
	return String(rule.createdAt)
}

function applyRule(previous: number, rule: CanonicalPriceRule): number {
	const value = Number(rule.value)
	if (!Number.isFinite(value)) return previous
	const rawType = String(rule.type ?? "").trim()
	const type =
		rawType === "fixed"
			? "fixed_override"
			: rawType === "override"
				? "fixed_override"
				: rawType === "percentage"
					? "percentage_markup"
					: rawType === "modifier"
						? "fixed_adjustment"
						: rawType

	switch (type) {
		case "fixed_override":
			return value
		case "base_adjustment":
		case "fixed_adjustment":
			return previous + value
		case "percentage":
		case "percentage_markup":
			return previous + (previous * Math.abs(value)) / 100
		case "percentage_discount":
			return previous - (previous * Math.abs(value)) / 100
		default:
			return previous
	}
}

export function evaluatePricingRules(params: EvaluateParams): EvaluateResult {
	const applicable = params.rules
		.filter((rule) => (rule.isActive ?? true) !== false)
		.filter((rule) => isRuleApplicableForDate(rule, params.date))
		.filter((rule) => isRuleApplicableForOccupancy(rule, params.occupancyKey))
		.sort((a, b) => {
			const pa = normalizeRulePriority(a)
			const pb = normalizeRulePriority(b)
			if (pa !== pb) return pa - pb
			const ca = normalizeRuleCreatedAt(a)
			const cb = normalizeRuleCreatedAt(b)
			if (ca !== cb) return ca.localeCompare(cb)
			return String(a.id).localeCompare(String(b.id))
		})

	let current = Number(params.basePrice)
	if (!Number.isFinite(current)) current = 0
	const appliedRuleIds: string[] = []
	const breakdown: NonNullable<EvaluateResult["breakdown"]> = []

	for (const rule of applicable) {
		const before = roundMoney(current)
		current = applyRule(current, rule)
		current = Math.max(0, current)
		const after = roundMoney(current)
		const delta = roundMoney(after - before)
		appliedRuleIds.push(String(rule.id))
		if (params.includeBreakdown) {
			breakdown.push({
				ruleId: String(rule.id),
				type: String(rule.type),
				value: Number(rule.value),
				priority: normalizeRulePriority(rule),
				before,
				after,
				delta,
			})
		}
	}

	return {
		price: roundMoney(Math.max(0, current)),
		appliedRuleIds,
		breakdown: params.includeBreakdown ? breakdown : undefined,
	}
}
