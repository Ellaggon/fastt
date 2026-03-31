import type { VariantQueryPort } from "../ports/VariantQueryPort"
import { isUnitType } from "../../domain/unit.types"
import type { SearchPipeline, SearchRatePlanOffer } from "../SearchPipeline"
import type { SellableUnit } from "../../domain/unit.types"

export type SearchOffer<TUnit extends SellableUnit> = {
	variantId: string
	variant: TUnit
	ratePlans: SearchRatePlanOffer[]
}

export class BuildOffersUseCase<TUnit extends SellableUnit> {
	constructor(
		private deps: {
			variantQuery: VariantQueryPort<TUnit>
			searchPipeline: SearchPipeline<TUnit>
		}
	) {}

	async execute(ctx: {
		productId: string
		checkIn: Date
		checkOut: Date
		rooms?: number
		adults: number
		children: number
	}): Promise<SearchOffer<TUnit>[]> {
		const units = await this.deps.variantQuery.getActiveByProduct(ctx.productId)

		if (!units.length) return []

		const results: SearchOffer<TUnit>[] = []

		for (const unit of units) {
			if (!isUnitType(unit.entityType)) continue

			try {
				const offers = await this.deps.searchPipeline.run({
					productId: ctx.productId,
					unitId: unit.id,
					unitType: unit.entityType,
					checkIn: ctx.checkIn,
					checkOut: ctx.checkOut,
					rooms: ctx.rooms,
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
