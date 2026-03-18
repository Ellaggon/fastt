// src/core/offers/OfferBuilderEngine.ts

import { SearchPipeline } from "@/core/search/SearchPipeline"
import { VariantRepository } from "@/repositories/VariantRepository"
import { isUnitType } from "@/core/search/unit.types"
import { SearchContextLoader } from "../search/SearchContextLoader"
import { globalAdapterRegistry } from "../search/adapters/adapter.globalRegistry"

export class OfferBuilderEngine {
	constructor(
		private variantsRepo = new VariantRepository(),
		private registry = globalAdapterRegistry
	) {
		const loader = new SearchContextLoader(this.registry)
		this.pipeline = new SearchPipeline(loader)
	}
	private pipeline: SearchPipeline

	async build(ctx: {
		productId: string
		checkIn: Date
		checkOut: Date
		adults: number
		children: number
	}) {
		const units = await this.variantsRepo.getActiveByProduct(ctx.productId)

		if (!units.length) return []

		const results = []

		for (const unit of units) {
			if (!isUnitType(unit.entityType)) continue

			try {
				const offers = await this.pipeline.run({
					productId: ctx.productId,
					unitId: unit.id,
					unitType: unit.entityType,
					checkIn: ctx.checkIn,
					checkOut: ctx.checkOut,
					adults: ctx.adults,
					children: ctx.children,
					basePrice: unit.basePrice ?? 0,
				})

				if (!offers.length) continue

				results.push({
					variantId: unit.id,
					variant: unit,
					ratePlans: offers.map((o) => ({
						ratePlanId: o.ratePlanId,
						basePrice: o.basePrice,
						finalPrice: o.finalPrice,
					})),
				})
			} catch (err) {
				console.error("Pipeline error for unit:", unit.id, err)
			}
		}

		return results
	}
}
