import type {
	SellableUnitAdapterPort,
	SearchContext,
} from "../../application/ports/SellableUnitAdapterPort"

export class HotelAdapter implements SellableUnitAdapterPort {
	constructor(
		private deps: {
			inventoryRepo: { getRange(variantId: string, from: Date, to: Date): Promise<any[]> }
			ratePlanRepo: { getActiveByVariant(variantId: string): Promise<any[]> }
			restrictionRepo: {
				loadActiveRules(input: {
					productId?: string
					variantId: string
					checkIn: Date
					checkOut: Date
					nights: number
				}): Promise<any[]>
			}
			priceRuleRepo: { getActive(ratePlanId: string): Promise<any[]> }
		}
	) {}

	async loadInventory(ctx: SearchContext) {
		return this.deps.inventoryRepo.getRange(ctx.unitId, ctx.checkIn, ctx.checkOut)
	}

	async loadRatePlans(ctx: SearchContext) {
		return this.deps.ratePlanRepo.getActiveByVariant(ctx.unitId)
	}

	async loadPriceRules(ctx: SearchContext) {
		const ratePlans = await this.loadRatePlans(ctx)

		const rules = await Promise.all(
			ratePlans.map((rp: any) => this.deps.priceRuleRepo.getActive(rp.id))
		)

		return rules.flat()
	}

	async loadRestrictions(ctx: SearchContext) {
		const nights = Math.ceil(
			(ctx.checkOut.getTime() - ctx.checkIn.getTime()) / (1000 * 60 * 60 * 24)
		)

		return this.deps.restrictionRepo.loadActiveRules({
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
