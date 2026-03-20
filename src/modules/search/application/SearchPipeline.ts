import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory } from "../domain/unit.types"
import type { SellableUnit } from "../domain/unit.types"
import type { InventorySnapshot } from "../domain/unit.types"
import type { AppliedPriceRule } from "../domain/pricing.types"
import type { PricingPort } from "./ports/PricingPort"
import type { RestrictionPort } from "./ports/RestrictionPort"
import type { PromotionPort } from "./ports/PromotionPort"

export type SearchRatePlanOffer = {
	ratePlanId: string
	basePrice: number
	finalPrice: number
}

export interface ISearchContextLoader<TUnit extends SellableUnit = SellableUnit> {
	load(ctx: SearchContext<TUnit>): Promise<SearchMemory>
}

export class SearchPipeline<TUnit extends SellableUnit = SellableUnit> {
	constructor(
		private loader: ISearchContextLoader<TUnit>,
		// private loader = new SearchContextLoader(globalAdapterRegistry),
		// private loader: { load(ctx: SearchContext): Promise<SearchMemory> },
		private availabilityEngine = new AvailabilityGridEngine(),
		private deps: {
			restrictions: RestrictionPort
			pricing: PricingPort
			promotions: PromotionPort
		}
	) {
		if (!loader) {
			throw new Error("SearchPipeline requires loader")
		}
	}

	async run(ctx: SearchContext<TUnit>): Promise<SearchRatePlanOffer[]> {
		const memory: SearchMemory = await this.loader.load(ctx)
		console.log("MEMORY", memory)

		/* 1️⃣ AVAILABILITY */

		// Preserve legacy behavior: rows with non-string dates are effectively ignored
		// by the availability engine (string comparisons). Filter explicitly for typing.
		const inventoryForGrid = memory.inventory.filter(
			(d): d is InventorySnapshot & { date: string } => typeof d.date === "string"
		)

		const grid = this.availabilityEngine.buildGridFromMemory(
			inventoryForGrid,
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

		const validPlans: SearchRatePlanOffer[] = []

		for (const rp of memory.ratePlans) {
			/* Restricciones por rate plan */

			const restrictions = memory.restrictions?.filter((r) => r.scopeId === rp.id) ?? []

			const restrictionResult = this.deps.restrictions.evaluateFromMemory({
				restrictions,
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
				nights,
			})

			if (!restrictionResult.allowed) continue

			/* Pricing con rule */

			const priceRules =
				memory.priceRules?.filter((r) => r.ratePlanId === rp.id && r.isActive) ?? []

			const runtimeRules = priceRules
				.map((r) => this.deps.pricing.adaptPriceRule(r))
				.filter((r): r is AppliedPriceRule => r !== null)

			const computed = this.deps.pricing.computeStay({
				basePrice: ctx.basePrice,
				nights,
				rules: runtimeRules,
				currency: "USD",
			})

			/* Promotions */

			const final = this.deps.promotions.applyPromotions(computed.total, memory.promotions ?? [], {
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
