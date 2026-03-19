import { AvailabilityGridEngine } from "@/core/availability/AvailabilityGridEngine"
import { RatePlanEngine } from "@/modules/pricing/domain/rate-plans/RatePlanEngine"
import { RestrictionRuleEngine } from "@/core/restrictions/RestrictionRuleEngine"
import { PricingEngine } from "@/modules/pricing/domain/PricingEngine"
import { PromotionEngine } from "@/modules/pricing/domain/promotions/PromotionEngine"
import { adaptPriceRule } from "@/modules/pricing/domain/adapters/adapter.priceRule"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory } from "../domain/unit.types"

export interface ISearchContextLoader {
	load(ctx: SearchContext): Promise<SearchMemory>
}

export class SearchPipeline {
	constructor(
		private loader: ISearchContextLoader,
		// private loader = new SearchContextLoader(globalAdapterRegistry),
		// private loader: { load(ctx: SearchContext): Promise<SearchMemory> },
		private availabilityEngine = new AvailabilityGridEngine(),
		private ratePlanEngine = new RatePlanEngine(),
		private restrictionEngine = new RestrictionRuleEngine(),
		private pricingEngine = new PricingEngine(),
		private promotionEngine = new PromotionEngine()
	) {
		if (!loader) {
			throw new Error("SearchPipeline requires loader")
		}
	}

	async run(ctx: SearchContext) {
		const memory: SearchMemory = await this.loader.load(ctx)
		console.log("MEMORY", memory)

		/* 1️⃣ AVAILABILITY */

		const grid = this.availabilityEngine.buildGridFromMemory(
			memory.inventory,
			ctx.checkIn,
			ctx.checkOut
		)

		if (!grid.length) return []

		if (grid.some((d) => d.stopSell)) return []

		if (grid.some((d) => d.availableRooms <= 0)) return []

		/* 2️⃣ NIGHTS */

		const nights = Math.ceil((ctx.checkOut.getTime() - ctx.checkIn.getTime()) / 86400000)

		if (nights <= 0) return []

		/* 4️⃣ RATE PLANS LOOP */

		const validPlans = []

		for (const rp of memory.ratePlans) {
			/* Restricciones por rate plan */

			const restrictions = memory.restrictions?.filter((r) => r.scopeId === rp.id) ?? []

			const restrictionResult = this.restrictionEngine.evaluateFromMemory({
				restrictions,
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
				nights,
			})

			if (!restrictionResult.allowed) continue

			/* Pricing con rule */

			const priceRules =
				memory.priceRules?.filter((r) => r.ratePlanId === rp.id && r.isActive) ?? []

			const runtimeRules = priceRules.map(adaptPriceRule).filter(Boolean) as any

			const computed = this.pricingEngine.computeStay({
				basePrice: ctx.basePrice,
				nights,
				rules: runtimeRules,
				currency: "USD",
			})

			/* Promotions */

			const final = this.promotionEngine.applyPromotions(computed.total, memory.promotions ?? [], {
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
			})

			validPlans.push({
				ratePlanId: rp.id,
				basePrice: computed.total,
				finalPrice: final,
			})
		}

		return validPlans
	}
}
