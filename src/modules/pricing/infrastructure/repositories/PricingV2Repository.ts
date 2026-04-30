import {
	and,
	asc,
	db,
	eq,
	EffectivePricingV2,
	gte,
	lte,
	lt,
	RatePlanOccupancyPolicy,
} from "astro:db"

type OccupancyPolicyRow = {
	baseAmount: number
	baseCurrency: string
	baseAdults: number
	baseChildren: number
	extraAdultMode: "fixed" | "percentage"
	extraAdultValue: number
	childMode: "fixed" | "percentage"
	childValue: number
	currency: string
}

export class PricingV2Repository {
	async getBaseFromPolicy(params: {
		ratePlanId: string
		date: string
		occupancyKey: string
	}): Promise<{
		baseAmount: number
		baseCurrency: string
	} | null> {
		void params.occupancyKey
		if (!RatePlanOccupancyPolicy || !(RatePlanOccupancyPolicy as any).baseAmount) {
			return null
		}
		const row = await db
			.select({
				baseAmount: (RatePlanOccupancyPolicy as any).baseAmount,
				baseCurrency: (RatePlanOccupancyPolicy as any).baseCurrency,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, params.ratePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, new Date(`${params.date}T00:00:00.000Z`)),
					gte(RatePlanOccupancyPolicy.effectiveTo, new Date(`${params.date}T00:00:00.000Z`))
				)
			)
			.orderBy(asc(RatePlanOccupancyPolicy.effectiveFrom))
			.get()
		if (!row) return null
		return {
			baseAmount: Number((row as any).baseAmount ?? 0),
			baseCurrency: String((row as any).baseCurrency ?? "USD"),
		}
	}

	async getActiveOccupancyPolicy(params: {
		ratePlanId: string
		date: string
	}): Promise<OccupancyPolicyRow | null> {
		if (!RatePlanOccupancyPolicy || !(RatePlanOccupancyPolicy as any).baseAdults) {
			return null
		}
		const row = await db
			.select({
				baseAmount: (RatePlanOccupancyPolicy as any).baseAmount,
				baseCurrency: (RatePlanOccupancyPolicy as any).baseCurrency,
				baseAdults: RatePlanOccupancyPolicy.baseAdults,
				baseChildren: RatePlanOccupancyPolicy.baseChildren,
				extraAdultMode: RatePlanOccupancyPolicy.extraAdultMode,
				extraAdultValue: RatePlanOccupancyPolicy.extraAdultValue,
				childMode: RatePlanOccupancyPolicy.childMode,
				childValue: RatePlanOccupancyPolicy.childValue,
				currency: RatePlanOccupancyPolicy.currency,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					eq(RatePlanOccupancyPolicy.ratePlanId, params.ratePlanId),
					lte(RatePlanOccupancyPolicy.effectiveFrom, new Date(`${params.date}T00:00:00.000Z`)),
					gte(RatePlanOccupancyPolicy.effectiveTo, new Date(`${params.date}T00:00:00.000Z`))
				)
			)
			.orderBy(asc(RatePlanOccupancyPolicy.effectiveFrom))
			.get()

		if (!row) return null
		return {
			baseAmount: Number((row as any).baseAmount ?? 0),
			baseCurrency: String((row as any).baseCurrency ?? "USD"),
			baseAdults: Math.max(1, Number(row.baseAdults ?? 1)),
			baseChildren: Math.max(0, Number(row.baseChildren ?? 0)),
			extraAdultMode: String(row.extraAdultMode) === "percentage" ? "percentage" : "fixed",
			extraAdultValue: Number(row.extraAdultValue ?? 0),
			childMode: String(row.childMode) === "percentage" ? "percentage" : "fixed",
			childValue: Number(row.childValue ?? 0),
			currency: String(row.currency ?? "USD"),
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
				baseComponent: params.baseComponent,
				occupancyAdjustment: params.occupancyAdjustment,
				ruleAdjustment: params.ruleAdjustment,
				finalBasePrice: params.finalBasePrice,
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
					baseComponent: params.baseComponent,
					occupancyAdjustment: params.occupancyAdjustment,
					ruleAdjustment: params.ruleAdjustment,
					finalBasePrice: params.finalBasePrice,
					currency: params.currency,
					computedAt: params.computedAt,
					sourceVersion: params.sourceVersion,
				},
			})
	}

	async countEffectivePricingV2Rows(params: {
		variantId: string
		ratePlanId: string
		from: string
		to: string
	}): Promise<number> {
		if (!EffectivePricingV2 || !(EffectivePricingV2 as any).id) return 0
		const rows = await db
			.select({ id: EffectivePricingV2.id })
			.from(EffectivePricingV2)
			.where(
				and(
					eq(EffectivePricingV2.variantId, params.variantId),
					eq(EffectivePricingV2.ratePlanId, params.ratePlanId),
					gte(EffectivePricingV2.date, params.from),
					lt(EffectivePricingV2.date, params.to)
				)
			)
			.all()
		return rows.length
	}
}
