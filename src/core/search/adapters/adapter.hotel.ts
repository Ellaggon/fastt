import { DailyInventoryRepository } from "@/repositories/AvailabilityRepository"
import { RatePlanRepository } from "@/repositories/RatePlanRepository"
import { RestrictionRepository } from "@/repositories/RestrictionRepository"
import { PriceRuleRepository } from "@/repositories/PriceRuleRepository"

import type { SellableUnitAdapter, SearchContext } from "./adapter.SellableUnit"

export class HotelAdapter implements SellableUnitAdapter {
	constructor(
		private inventoryRepo = new DailyInventoryRepository(),
		private ratePlanRepo = new RatePlanRepository(),
		private restrictionRepo = new RestrictionRepository(),
		private priceRuleRepo = new PriceRuleRepository()
	) {}

	async loadInventory(ctx: SearchContext) {
		return this.inventoryRepo.getRange(ctx.unitId, ctx.checkIn, ctx.checkOut)
	}

	async loadRatePlans(ctx: SearchContext) {
		return this.ratePlanRepo.getActiveByVariant(ctx.unitId)
	}

	async loadPriceRules(ctx: SearchContext) {
		const ratePlans = await this.loadRatePlans(ctx)

		const rules = await Promise.all(ratePlans.map((rp) => this.priceRuleRepo.getActive(rp.id)))

		return rules.flat()
	}

	async loadRestrictions(ctx: SearchContext) {
		const nights = Math.ceil(
			(ctx.checkOut.getTime() - ctx.checkIn.getTime()) / (1000 * 60 * 60 * 24)
		)

		return this.restrictionRepo.loadActiveRules({
			productId: ctx.productId ?? undefined,
			variantId: ctx.unitId,
			checkIn: ctx.checkIn,
			checkOut: ctx.checkOut,
			nights,
		})
	}

	async loadPromotions(ctx: SearchContext) {
		return [] // hasta que tengas repo real
	}
}
