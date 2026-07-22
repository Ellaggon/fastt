import {
	first,
	and,
	desc,
	db,
	eq,
	EffectivePricingV2,
	gt,
	gte,
	inArray,
	isNull,
	lte,
	lt,
	or,
	RatePlanOccupancyPolicy,
} from "@/shared/infrastructure/db/compat"
import { logger } from "@/lib/observability/logger"

type OccupancyPolicyRow = {
	baseAmount: number
	currency: string
	baseAdults: number
	baseChildren: number
	extraAdultMode: "fixed" | "percentage"
	extraAdultValue: number
	childMode: "fixed" | "percentage"
	childValue: number
}

export class PricingV2Repository {
	async getFallbackCurrency(_ratePlanId: string): Promise<string> {
		// A fixed date price can bootstrap coverage before a baseline exists.
		// Currency remains the platform default until the canonical baseline is configured.
		return "USD"
	}

	async getBaseFromPolicy(params: {
		ratePlanId: string
		date: string
		occupancyKey: string
	}): Promise<{
		baseAmount: number
		currency: string
	} | null> {
		void params.occupancyKey
		if (!RatePlanOccupancyPolicy || !(RatePlanOccupancyPolicy as any).baseAmount) {
			return null
		}
		const targetDate = new Date(`${params.date}T00:00:00.000Z`)
		const rows = await db
			.select({
				id: RatePlanOccupancyPolicy.id,
				baseAmount: (RatePlanOccupancyPolicy as any).baseAmount,
				currency: RatePlanOccupancyPolicy.currency,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, params.ratePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
					or(
						isNull(RatePlanOccupancyPolicy.effectiveTo),
						gt(RatePlanOccupancyPolicy.effectiveTo, targetDate)
					)
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.limit(2)

		const row = rows[0]
		if (!row) {
			return this.getBaseFromExistingEffectivePricing(params)
		}
		if (rows.length > 1) {
			logger.warn("pricing_v2_policy_overlap_detected", {
				ratePlanId: params.ratePlanId,
				date: params.date,
				occupancyKey: params.occupancyKey,
				selectedPolicyId: String(row.id),
				candidatePolicyIds: rows.map((candidate) => String(candidate.id)),
			})
		}
		return {
			baseAmount: Number((row as any).baseAmount ?? 0),
			currency: String((row as any).currency ?? "USD"),
		}
	}

	private async getBaseFromExistingEffectivePricing(params: {
		ratePlanId: string
		date: string
		occupancyKey: string
	}): Promise<{
		baseAmount: number
		currency: string
	} | null> {
		if (!EffectivePricingV2 || !(EffectivePricingV2 as any).baseComponent) {
			return null
		}
		const row = await db
			.select({
				baseAmount: EffectivePricingV2.baseComponent,
				currency: EffectivePricingV2.currency,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
					eq(EffectivePricingV2.date, params.date),
					eq(EffectivePricingV2.occupancyKey, params.occupancyKey)
				)
			)
			.orderBy(desc(EffectivePricingV2.computedAt), desc(EffectivePricingV2.id))
			.limit(1)
			.then(first)
		if (!row) return null
		return {
			baseAmount: Number((row as any).baseAmount ?? 0),
			currency: String((row as any).currency ?? "USD"),
		}
	}

	async getActiveOccupancyPolicy(params: {
		ratePlanId: string
		date: string
	}): Promise<OccupancyPolicyRow | null> {
		if (!RatePlanOccupancyPolicy || !(RatePlanOccupancyPolicy as any).baseAdults) {
			return null
		}
		const targetDate = new Date(`${params.date}T00:00:00.000Z`)
		const rows = await db
			.select({
				id: RatePlanOccupancyPolicy.id,
				baseAmount: (RatePlanOccupancyPolicy as any).baseAmount,
				currency: RatePlanOccupancyPolicy.currency,
				baseAdults: RatePlanOccupancyPolicy.baseAdults,
				baseChildren: RatePlanOccupancyPolicy.baseChildren,
				extraAdultMode: RatePlanOccupancyPolicy.extraAdultMode,
				extraAdultValue: RatePlanOccupancyPolicy.extraAdultValue,
				childMode: RatePlanOccupancyPolicy.childMode,
				childValue: RatePlanOccupancyPolicy.childValue,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, params.ratePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
					or(
						isNull(RatePlanOccupancyPolicy.effectiveTo),
						gt(RatePlanOccupancyPolicy.effectiveTo, targetDate)
					)
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.limit(2)

		const row = rows[0]
		if (row && rows.length > 1) {
			logger.warn("pricing_v2_policy_overlap_detected", {
				ratePlanId: params.ratePlanId,
				date: params.date,
				selectedPolicyId: String(row.id),
				candidatePolicyIds: rows.map((candidate) => String(candidate.id)),
			})
		}

		if (!row) return null
		return {
			baseAmount: Number((row as any).baseAmount ?? 0),
			currency: String((row as any).currency ?? "USD"),
			baseAdults: Math.max(1, Number(row.baseAdults ?? 1)),
			baseChildren: Math.max(0, Number(row.baseChildren ?? 0)),
			extraAdultMode: String(row.extraAdultMode) === "percentage" ? "percentage" : "fixed",
			extraAdultValue: Number(row.extraAdultValue ?? 0),
			childMode: String(row.childMode) === "percentage" ? "percentage" : "fixed",
			childValue: Number(row.childValue ?? 0),
		}
	}

	async saveEffectivePricingV2(params: {
		id: string
		variantId: string
		ratePlanId: string
		date: string
		occupancyKey: string
		baseComponent: number
		occupancyAdjustment: number
		ruleAdjustment: number
		finalBasePrice: number
		currency: string
		computedAt: Date
		sourceVersion: string
	}): Promise<void> {
		if (!EffectivePricingV2 || !(EffectivePricingV2 as any).variantId) return
		await db
			.insert(EffectivePricingV2)
			.values({
				id: params.id,
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				date: params.date,
				occupancyKey: params.occupancyKey,
				baseComponent: String(params.baseComponent),
				occupancyAdjustment: String(params.occupancyAdjustment),
				ruleAdjustment: String(params.ruleAdjustment),
				finalBasePrice: String(params.finalBasePrice),
				currency: params.currency,
				computedAt: params.computedAt,
				sourceVersion: params.sourceVersion,
			})
			.onConflictDoUpdate({
				target: [
					EffectivePricingV2.variantId,
					EffectivePricingV2.ratePlanId,
					EffectivePricingV2.date,
					EffectivePricingV2.occupancyKey,
				],
				set: {
					baseComponent: String(params.baseComponent),
					occupancyAdjustment: String(params.occupancyAdjustment),
					ruleAdjustment: String(params.ruleAdjustment),
					finalBasePrice: String(params.finalBasePrice),
					currency: params.currency,
					computedAt: params.computedAt,
					sourceVersion: params.sourceVersion,
				},
			})
	}

	async listEffectivePricingV2Combinations(params: {
		variantId: string
		ratePlanId: string
		from: string
		to: string
		occupancyKeys?: string[]
	}): Promise<Array<{ date: string; occupancyKey: string }>> {
		if (!EffectivePricingV2 || !(EffectivePricingV2 as any).id) return []
		const occupancyPredicate =
			params.occupancyKeys && params.occupancyKeys.length > 0
				? inArray(EffectivePricingV2.occupancyKey, params.occupancyKeys)
				: undefined
		const rows = await db
			.select({
				date: EffectivePricingV2.date,
				occupancyKey: EffectivePricingV2.occupancyKey,
			})
			.from(EffectivePricingV2)
			.where(
				and(
					eq(EffectivePricingV2.variantId, params.variantId),
					eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
					gte(EffectivePricingV2.date, params.from),
					lt(EffectivePricingV2.date, params.to),
					occupancyPredicate
				)
			)

		return rows.map((row) => ({
			date: String(row.date),
			occupancyKey: String(row.occupancyKey),
		}))
	}
}
