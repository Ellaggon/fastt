import { AvailabilityGridEngine } from "@/core/availability/AvailabilityGridEngine"
import { RatePlanEngine } from "@/core/rate-plans/RatePlanEngine"
import { RestrictionRuleEngine } from "@/core/restrictions/RestrictionRuleEngine"
import { PricingEngine } from "@/core/pricing/PricingEngine"
import { PromotionEngine } from "@/core/promotions/PromotionEngine"
import { adaptPriceRule } from "../pricing/adapters/adapter.priceRule"

import type { SearchContext } from "./adapters/adapter.SellableUnit"
import type { SearchMemory } from "./unit.types"

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

		/* 3️⃣ BASE PRICING (per stay) */

		// const basePricing = this.pricingEngine.computeStay({
		// 	basePrice: ctx.basePrice,
		// 	nights,
		// 	rules: [],
		// 	currency: "USD",
		// })

		// console.log("RATEPLANS RAW", memory.ratePlans)
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

			// if (restrictionResult.stopSell) continue

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

			// console.log("GRID", grid)
			// console.log("RESTRICTIONS", restrictionResult)
			// console.log("VALID PLANS", validPlans)
		}

		// ===============================
		// 6️⃣ PROMOTIONS
		// ===============================

		// const enriched = ratePlans.map((rp) => {
		// 	const finalPrice = this.promotionEngine.applyPromotions(rp.price, memory.promotions ?? [], {
		// 		checkIn: ctx.checkIn,
		// 		checkOut: ctx.checkOut,
		// 	})

		// 	return {
		// 		...rp,
		// 		basePrice: rp.price,
		// 		finalPrice,
		// 	}
		// })

		return validPlans
	}
}
