import {
	first,
	and,
	asc,
	count,
	db,
	desc,
	EffectivePricingV2,
	eq,
	gt,
	inArray,
	lte,
	RatePlan,
	RatePlanOccupancyPolicy,
} from "@/shared/infrastructure/db/compat"
import { listCommercialPriceRulesByRatePlan } from "@/lib/commercial-rules/commercialRulesRepository"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import type {
	PricingRuleUiSummary,
	RatePlanPricingReadRepositoryPort,
	RatePlanPricingModifierSummary,
} from "../../application/ports/RatePlanPricingReadRepositoryPort"

const CANONICAL_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

export class RatePlanPricingReadRepository implements RatePlanPricingReadRepositoryPort {
	async getDefaultRatePlanPricingSummaryByVariant(variantId: string) {
		const plan = await db
			.select({ id: RatePlan.id, createdAt: RatePlan.createdAt })
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.orderBy(asc(RatePlan.createdAt), asc(RatePlan.id))
			.then(first)
		if (!plan?.id) return null
		return this.getRatePlanPricingSummary(String(plan.id))
	}

	async getRatePlanPricingSummary(ratePlanId: string) {
		const normalizedRatePlanId = String(ratePlanId ?? "").trim()
		if (!normalizedRatePlanId) return null

		const targetDate = new Date()
		const policy = await db
			.select({
				currency: RatePlanOccupancyPolicy.baseCurrency,
				basePrice: RatePlanOccupancyPolicy.baseAmount,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, normalizedRatePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
					gt(RatePlanOccupancyPolicy.effectiveTo, targetDate)
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.then(first)
		const fallbackEffective = policy
			? null
			: await db
					.select({
						currency: EffectivePricingV2.currency,
						basePrice: EffectivePricingV2.baseComponent,
					})
					.from(EffectivePricingV2)
					.where(
						and(
							eq(EffectivePricingV2.ratePlanId, normalizedRatePlanId),
							eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY)
						)
					)
					.orderBy(desc(EffectivePricingV2.date), desc(EffectivePricingV2.computedAt))
					.limit(1)
					.then(first)
		const baseSource = policy ?? fallbackEffective
		if (!baseSource) return null

		const effectivePricingDays = Number(
			(
				await db
					.select({ value: count() })
					.from(EffectivePricingV2)
					.where(
						and(
							eq(EffectivePricingV2.ratePlanId, normalizedRatePlanId),
							eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY)
						)
					)
					.then(first)
			)?.value ?? 0
		)

		return {
			ratePlanId: normalizedRatePlanId,
			currency: String(baseSource.currency ?? "USD"),
			basePrice: Number(baseSource.basePrice ?? 0),
			effectivePricingDays,
			coverageOccupancyKey: CANONICAL_OCCUPANCY_KEY,
		}
	}

	async listRatePlanPricingSummaries(ratePlanIds: string[]) {
		const ids = [...new Set(ratePlanIds.map((id) => String(id).trim()).filter(Boolean))]
		if (!ids.length) return []
		const targetDate = new Date()
		const [policies, effectiveRows, coverageRows] = await Promise.all([
			db
				.select({
					ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
					currency: RatePlanOccupancyPolicy.baseCurrency,
					basePrice: RatePlanOccupancyPolicy.baseAmount,
					effectiveFrom: RatePlanOccupancyPolicy.effectiveFrom,
					id: RatePlanOccupancyPolicy.id,
				})
				.from(RatePlanOccupancyPolicy)
				.where(
					and(
						inArray(RatePlanOccupancyPolicy.ratePlanId, ids),
						lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
						gt(RatePlanOccupancyPolicy.effectiveTo, targetDate)
					)
				)
				.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id)),
			db
				.select({
					ratePlanId: EffectivePricingV2.ratePlanId,
					currency: EffectivePricingV2.currency,
					basePrice: EffectivePricingV2.baseComponent,
					date: EffectivePricingV2.date,
				})
				.from(EffectivePricingV2)
				.where(
					and(
						inArray(EffectivePricingV2.ratePlanId, ids),
						eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY)
					)
				)
				.orderBy(desc(EffectivePricingV2.date), desc(EffectivePricingV2.computedAt)),
			db
				.select({ ratePlanId: EffectivePricingV2.ratePlanId, value: count() })
				.from(EffectivePricingV2)
				.where(
					and(
						inArray(EffectivePricingV2.ratePlanId, ids),
						eq(EffectivePricingV2.occupancyKey, CANONICAL_OCCUPANCY_KEY)
					)
				)
				.groupBy(EffectivePricingV2.ratePlanId),
		])

		const policyByRatePlan = new Map<string, (typeof policies)[number]>()
		for (const policy of policies) {
			const id = String(policy.ratePlanId)
			if (!policyByRatePlan.has(id)) policyByRatePlan.set(id, policy)
		}
		const effectiveByRatePlan = new Map<string, (typeof effectiveRows)[number]>()
		for (const row of effectiveRows) {
			const id = String(row.ratePlanId)
			if (!effectiveByRatePlan.has(id)) effectiveByRatePlan.set(id, row)
		}
		const coverageByRatePlan = new Map(
			coverageRows.map((row) => [String(row.ratePlanId), Number(row.value ?? 0)])
		)

		return ids.flatMap((ratePlanId) => {
			const source = policyByRatePlan.get(ratePlanId) ?? effectiveByRatePlan.get(ratePlanId)
			if (!source) return []
			return [
				{
					ratePlanId,
					currency: String(source.currency ?? "USD"),
					basePrice: Number(source.basePrice ?? 0),
					effectivePricingDays: coverageByRatePlan.get(ratePlanId) ?? 0,
					coverageOccupancyKey: CANONICAL_OCCUPANCY_KEY,
				},
			]
		})
	}

	async listRatePlanModifierSummaryByVariant(
		variantId: string
	): Promise<RatePlanPricingModifierSummary[]> {
		const ratePlanName = await resolveRatePlanNameColumn()
		const plans = await db
			.select({
				id: RatePlan.id,
				name: ratePlanName,
				isDefault: RatePlan.isDefault,
				isActive: RatePlan.isActive,
			})
			.from(RatePlan)
			.where(eq(RatePlan.variantId, variantId))
			.orderBy(desc(RatePlan.isDefault), desc(RatePlan.isActive), asc(RatePlan.createdAt))

		return Promise.all(
			plans.map(async (plan) => {
				const activeModifiers = (await listCommercialPriceRulesByRatePlan(String(plan.id))).filter(
					(rule) => rule.isActive
				).length
				return {
					id: String(plan.id),
					name: String(plan.name ?? "Rate plan"),
					isDefault: Boolean(plan.isDefault),
					isActive: Boolean(plan.isActive),
					activeModifiers,
				}
			})
		)
	}

	async listActiveRulesForRatePlan(ratePlanId: string): Promise<PricingRuleUiSummary[]> {
		const normalizedRatePlanId = String(ratePlanId ?? "").trim()
		if (!normalizedRatePlanId) return []

		const rows = (await listCommercialPriceRulesByRatePlan(normalizedRatePlanId))
			.filter((rule) => rule.isActive)
			.sort((a, b) => {
				if (a.priority !== b.priority) return a.priority - b.priority
				if (a.createdAt.getTime() !== b.createdAt.getTime()) {
					return a.createdAt.getTime() - b.createdAt.getTime()
				}
				return a.id.localeCompare(b.id)
			})

		return rows.map((rule) => {
			const dateFrom =
				rule.dateRangeJson && typeof rule.dateRangeJson === "object"
					? String((rule.dateRangeJson as any).from ?? "").trim() || null
					: null
			const dateTo =
				rule.dateRangeJson && typeof rule.dateRangeJson === "object"
					? String((rule.dateRangeJson as any).to ?? "").trim() || null
					: null
			const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
			const dayOfWeek = Array.isArray(rule.dayOfWeekJson)
				? (rule.dayOfWeekJson as unknown[])
						.map((value) => Number(value))
						.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
				: []
			const rawName = typeof rule.name === "string" ? rule.name.trim() : ""
			const contextFromName =
				rawName.startsWith("ctx:") &&
				(rawName.slice(4) === "season" ||
					rawName.slice(4) === "promotion" ||
					rawName.slice(4) === "day" ||
					rawName.slice(4) === "manual")
					? (rawName.slice(4) as "season" | "promotion" | "day" | "manual")
					: null
			const fallbackContext =
				rule.type === "fixed_override"
					? "manual"
					: dateFrom || dateTo
						? "season"
						: dayOfWeek.length > 0
							? "day"
							: rule.type === "percentage_discount"
								? "promotion"
								: "season"
			const contextKey = contextFromName ?? fallbackContext

			return {
				id: String(rule.id),
				name: rawName || null,
				type: String(rule.type),
				value: Number(rule.value),
				priority: Number(rule.priority ?? 10),
				dateFrom,
				dateTo,
				dayOfWeek,
				hasInvalidDateRange,
				contextKey,
			}
		})
	}
}
