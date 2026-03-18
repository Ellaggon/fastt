import { db, eq, PriceRule, EffectivePricing } from "astro:db"
import { adaptPriceRule } from "@/core/pricing/adapters/adapter.priceRule"
import type { AppliedPriceRule } from "@/core/pricing/pricing.types"

export class PricingRepository {
	async getRules(ratePlanId: string): Promise<AppliedPriceRule[]> {
		const rows = await db.select().from(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))

		return rows.map(adaptPriceRule).filter((r): r is AppliedPriceRule => r !== null)
	}

	async saveEffectivePrice(params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
		finalBasePrice: number
	}) {
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
}
