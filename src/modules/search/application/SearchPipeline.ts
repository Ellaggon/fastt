import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"

import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { SearchMemory, SellableUnit, InventorySnapshot } from "../domain/unit.types"
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
		// private loader = new SearchContextLoader(globalRegistry),
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

			let computedTotal: number
			try {
				computedTotal = this.deps.pricing.computeStayBasePriceWithRulesStrict({
					basePricePerNight: ctx.basePrice,
					nights,
					priceRules,
				})
			} catch {
				// Strict rule model: invalid rule types/values make the plan non-applicable.
				continue
			}

			/* Promotions */

			const final = this.deps.promotions.applyPromotions(computedTotal, memory.promotions ?? [], {
				checkIn: ctx.checkIn,
				checkOut: ctx.checkOut,
			})

			validPlans.push({
				ratePlanId: rp.id,
				basePrice: computedTotal,
				finalPrice: final,
			})
		}

		return validPlans
	}
}
