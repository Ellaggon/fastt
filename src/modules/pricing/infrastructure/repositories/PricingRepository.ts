import { and, asc, db, EffectivePricing, eq, gte, lt, PriceRule } from "astro:db"
import { adaptPriceRule } from "../../domain/adapters/adapter.priceRule"
import type { AppliedPriceRule } from "../../domain/pricing.types"
import type { PricingRepositoryPort } from "../../application/ports/PricingRepositoryPort"

export class PricingRepository implements PricingRepositoryPort {
	async getRules(ratePlanId: string): Promise<AppliedPriceRule[]> {
		const rows = await db.select().from(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))

		return rows.map(adaptPriceRule).filter((r): r is AppliedPriceRule => r !== null)
	}

	async getPreviewRules(ratePlanId: string) {
		// Deterministic ordering for preview computations: createdAt ASC.
		// (id ASC tie-breaker is implicit in SQLite row ordering only sometimes; we do it explicitly.)
		const rows = await db
			.select({
				id: PriceRule.id,
				type: PriceRule.type,
				value: PriceRule.value,
				priority: PriceRule.priority,
				dateRangeJson: (PriceRule as any).dateRangeJson,
				dayOfWeekJson: (PriceRule as any).dayOfWeekJson,
				createdAt: PriceRule.createdAt,
				isActive: PriceRule.isActive,
			})
			.from(PriceRule)
			.where(eq(PriceRule.ratePlanId, ratePlanId))
			.orderBy(asc(PriceRule.createdAt), asc(PriceRule.id))
			.all()

		// Only active rules should affect preview computations.
		const active = rows.filter((r) => r.isActive)
		// NOTE: We intentionally do NOT adapt types here. Use-cases validate allowed types.
		return active.map((r) => ({
			id: r.id,
			type: r.type,
			value: r.value,
			priority: Number(r.priority ?? 10),
			dateRangeJson: (r as any).dateRangeJson ?? null,
			dayOfWeekJson: Array.isArray((r as any).dayOfWeekJson)
				? (r as any).dayOfWeekJson.map((value: unknown) => Number(value))
				: null,
			createdAt: r.createdAt,
		})) as Array<{
			id: string
			type: string
			value: number
			priority: number
			dateRangeJson?: { from?: string | null; to?: string | null } | null
			dayOfWeekJson?: number[] | null
			createdAt: Date
		}>
	}

	async saveEffectivePrice(params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
		finalBasePrice: number
	}): Promise<void> {
		await db
			.insert(EffectivePricing)
			.values({
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				date: params.date,
				basePrice: params.basePrice,
				finalBasePrice: params.finalBasePrice,
				yieldMultiplier: 1,
				computedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [EffectivePricing.variantId, EffectivePricing.ratePlanId, EffectivePricing.date],
				set: {
					basePrice: params.basePrice,
					finalBasePrice: params.finalBasePrice,
					computedAt: new Date(),
				},
			})
	}

	async listEffectivePricingDates(params: {
		variantId: string
		ratePlanId: string
		from: string
		to: string
	}): Promise<string[]> {
		const rows = await db
			.select({ date: EffectivePricing.date })
			.from(EffectivePricing)
			.where(
				and(
					eq(EffectivePricing.variantId, params.variantId),
					eq(EffectivePricing.ratePlanId, params.ratePlanId),
					gte(EffectivePricing.date, params.from),
					lt(EffectivePricing.date, params.to)
				)
			)
			.all()

		return rows.map((row) => String(row.date))
	}
}
