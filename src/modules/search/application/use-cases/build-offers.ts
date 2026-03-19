import type { VariantQueryPort } from "../ports/VariantQueryPort"
import { isUnitType } from "../../domain/unit.types"
import type { SearchPipeline } from "../SearchPipeline"

export class BuildOffersUseCase {
	constructor(
		private deps: {
			variantQuery: VariantQueryPort
			searchPipeline: SearchPipeline
		}
	) {}

	async execute(ctx: {
		productId: string
		checkIn: Date
		checkOut: Date
		adults: number
		children: number
	}) {
		const units = await this.deps.variantQuery.getActiveByProduct(ctx.productId)

		if (!units.length) return []

		const results = []

		for (const unit of units) {
			if (!isUnitType(unit.entityType)) continue

			try {
				const offers = await this.deps.searchPipeline.run({
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
					ratePlans: offers.map((o: any) => ({
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
