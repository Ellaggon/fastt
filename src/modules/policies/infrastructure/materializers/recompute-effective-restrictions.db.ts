import {
	and,
	db,
	EffectiveRestriction,
	eq,
	gte,
	inArray,
	lte,
	RatePlan,
	Restriction,
	sql,
	Variant,
} from "astro:db"

import type { RestrictionScope } from "../../domain/restrictions/restrictions.types"
import type {
	EffectiveRestrictionsMaterializerPort,
	RecomputeEffectiveRestrictionsForScopeInput,
	RecomputeEffectiveRestrictionsForVariantRangeInput,
	RecomputeEffectiveRestrictionsResult,
} from "../../application/use-cases/recompute-effective-restrictions"

type SupportedRestrictionType =
	| "stop_sell"
	| "min_los"
	| "max_los"
	| "cta"
	| "ctd"
	| "min_lead_time"
	| "max_lead_time"

type RestrictionRuleRow = {
	id: string
	scope: RestrictionScope
	scopeId: string
	type: SupportedRestrictionType
	value: number | null
	startDate: string
	endDate: string
	validDays: number[]
	priority: number
}

type RatePlanContext = {
	id: string
	variantId: string
}

function parseDateOnly(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim())) return null
	const date = new Date(`${value}T00:00:00.000Z`)
	return Number.isNaN(date.getTime()) ? null : date
}

function toDateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function addDays(dateOnly: string, days: number): string {
	const date = parseDateOnly(dateOnly)
	if (!date) throw new Error("invalid_date")
	date.setUTCDate(date.getUTCDate() + days)
	return toDateOnly(date)
}

function enumerateDates(from: string, toExclusive: string): string[] {
	const start = parseDateOnly(from)
	const end = parseDateOnly(toExclusive)
	if (!start || !end || end <= start) throw new Error("invalid_date_range")
	const dates: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		dates.push(toDateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return dates
}

function overlapsDate(rule: RestrictionRuleRow, date: string): boolean {
	if (rule.startDate > date || rule.endDate < date) return false
	if (!rule.validDays.length) return true
	const day0 = parseDateOnly(date)?.getUTCDay()
	if (day0 == null) return false
	const day1 = day0 === 0 ? 7 : day0
	return rule.validDays.includes(day1) || rule.validDays.includes(day0)
}

function normalizeValidDays(value: unknown): number[] {
	const values = Array.isArray(value) ? value : value == null ? [] : [value]
	return Array.from(
		new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item)))
	).filter((item) => item >= 0 && item <= 7)
}

function normalizeRule(row: any): RestrictionRuleRow | null {
	const type = String(row.type ?? "") as SupportedRestrictionType
	if (
		!["stop_sell", "min_los", "max_los", "cta", "ctd", "min_lead_time", "max_lead_time"].includes(
			type
		)
	) {
		return null
	}
	return {
		id: String(row.id),
		scope: String(row.scope) as RestrictionScope,
		scopeId: String(row.scopeId),
		type,
		value: row.value == null ? null : Number(row.value),
		startDate: String(row.startDate),
		endDate: String(row.endDate),
		validDays: normalizeValidDays(row.validDays),
		priority: Number(row.priority ?? 100),
	}
}

async function resolveVariantContext(variantId: string): Promise<{
	productId: string
	ratePlans: RatePlanContext[]
} | null> {
	const variant = await db
		.select({ productId: Variant.productId })
		.from(Variant)
		.where(eq(Variant.id, variantId))
		.get()
	if (!variant) return null
	const ratePlans = await db
		.select({ id: RatePlan.id })
		.from(RatePlan)
		.where(and(eq(RatePlan.variantId, variantId), eq(RatePlan.isActive, true)))
		.all()
	return {
		productId: String(variant.productId),
		ratePlans: ratePlans.map((row) => ({
			id: String(row.id),
			variantId,
		})),
	}
}

async function resolveVariantIdsForScope(
	scope: RestrictionScope,
	scopeId: string
): Promise<string[]> {
	if (scope === "variant") return [scopeId]
	if (scope === "product") {
		const variants = await db
			.select({ id: Variant.id })
			.from(Variant)
			.where(eq(Variant.productId, scopeId))
			.all()
		return variants.map((row) => String(row.id))
	}
	const ratePlan = await db
		.select({ variantId: RatePlan.variantId })
		.from(RatePlan)
		.where(eq(RatePlan.id, scopeId))
		.get()
	return ratePlan?.variantId ? [String(ratePlan.variantId)] : []
}

async function loadApplicableRules(params: {
	variantId: string
	ratePlanId: string
	from: string
	to: string
}): Promise<RestrictionRuleRow[]> {
	const context = await resolveVariantContext(params.variantId)
	if (!context) return []
	const toInclusive = addDays(params.to, -1)
	const scopeIds = [context.productId, params.variantId, params.ratePlanId].filter(Boolean)
	if (!scopeIds.length) return []
	const rows = await db
		.select()
		.from(Restriction)
		.where(
			and(
				eq(Restriction.isActive, true),
				inArray(Restriction.scopeId, scopeIds),
				lte(Restriction.startDate, toInclusive),
				gte(Restriction.endDate, params.from)
			)
		)
		.all()
	return rows.map(normalizeRule).filter((rule): rule is RestrictionRuleRow => rule != null)
}

function computeDayProjection(rules: RestrictionRuleRow[]) {
	const minStayValues = rules
		.filter((rule) => rule.type === "min_los" && Number.isFinite(Number(rule.value)))
		.map((rule) => Math.max(1, Number(rule.value)))
	const maxStayValues = rules
		.filter((rule) => rule.type === "max_los" && Number.isFinite(Number(rule.value)))
		.map((rule) => Math.max(1, Number(rule.value)))
	const minLeadTimeValues = rules
		.filter((rule) => rule.type === "min_lead_time" && Number.isFinite(Number(rule.value)))
		.map((rule) => Math.max(1, Number(rule.value)))
	const maxLeadTimeValues = rules
		.filter((rule) => rule.type === "max_lead_time" && Number.isFinite(Number(rule.value)))
		.map((rule) => Math.max(1, Number(rule.value)))
	return {
		stopSell: rules.some((rule) => rule.type === "stop_sell"),
		cta: rules.some((rule) => rule.type === "cta"),
		ctd: rules.some((rule) => rule.type === "ctd"),
		minStay: minStayValues.length ? Math.max(...minStayValues) : null,
		maxStay: maxStayValues.length ? Math.min(...maxStayValues) : null,
		minLeadTime: minLeadTimeValues.length ? Math.max(...minLeadTimeValues) : null,
		maxLeadTime: maxLeadTimeValues.length ? Math.min(...maxLeadTimeValues) : null,
		priority: rules.length ? Math.min(...rules.map((rule) => rule.priority)) : 0,
	}
}

export async function recomputeEffectiveRestrictionsForVariantRange(
	input: RecomputeEffectiveRestrictionsForVariantRangeInput
): Promise<RecomputeEffectiveRestrictionsResult> {
	const dates = enumerateDates(input.from, input.to)
	const context = await resolveVariantContext(input.variantId)
	const ratePlans = context?.ratePlans ?? []
	const computedAt = new Date()
	const rows = (
		await Promise.all(
			ratePlans.map(async (ratePlan) => {
				const rules = await loadApplicableRules({
					variantId: input.variantId,
					ratePlanId: ratePlan.id,
					from: input.from,
					to: input.to,
				})
				return dates.map((date) => {
					const applicable = rules.filter((rule) => overlapsDate(rule, date))
					const projection = computeDayProjection(applicable)
					return {
						id: `er_${input.variantId}_${ratePlan.id}_${date}`,
						variantId: input.variantId,
						ratePlanId: ratePlan.id,
						date,
						...projection,
						computedAt,
					}
				})
			})
		)
	).flat()
	if (rows.length) {
		await db
			.insert(EffectiveRestriction)
			.values(rows as any)
			.onConflictDoUpdate({
				target: [
					EffectiveRestriction.variantId,
					EffectiveRestriction.ratePlanId,
					EffectiveRestriction.date,
				],
				set: {
					minStay: sql`excluded.minStay`,
					maxStay: sql`excluded.maxStay`,
					minLeadTime: sql`excluded.minLeadTime`,
					maxLeadTime: sql`excluded.maxLeadTime`,
					cta: sql`excluded.cta`,
					ctd: sql`excluded.ctd`,
					stopSell: sql`excluded.stopSell`,
					priority: sql`excluded.priority`,
					computedAt: sql`excluded.computedAt`,
				},
			})
	}
	return {
		variantIds: [input.variantId],
		ratePlanIds: ratePlans.map((ratePlan) => ratePlan.id),
		from: input.from,
		to: input.to,
		rows: rows.length,
	}
}

export async function recomputeEffectiveRestrictionsForScope(
	input: RecomputeEffectiveRestrictionsForScopeInput
): Promise<RecomputeEffectiveRestrictionsResult> {
	const variantIds = await resolveVariantIdsForScope(input.scope, input.scopeId)
	let rows = 0
	const ratePlanIds = new Set<string>()
	for (const variantId of variantIds) {
		const result = await recomputeEffectiveRestrictionsForVariantRange({
			variantId,
			from: input.from,
			to: input.to,
			reason: input.reason,
		})
		rows += result.rows
		for (const ratePlanId of result.ratePlanIds) ratePlanIds.add(ratePlanId)
	}
	return {
		variantIds,
		ratePlanIds: [...ratePlanIds].sort((a, b) => a.localeCompare(b)),
		from: input.from,
		to: input.to,
		rows,
	}
}

export function toExclusiveRestrictionDate(endDateInclusive: string): string {
	return addDays(endDateInclusive, 1)
}

export const dbEffectiveRestrictionsMaterializer: EffectiveRestrictionsMaterializerPort = {
	recomputeForVariantRange: recomputeEffectiveRestrictionsForVariantRange,
	recomputeForScope: recomputeEffectiveRestrictionsForScope,
	toExclusiveRestrictionDate,
}
