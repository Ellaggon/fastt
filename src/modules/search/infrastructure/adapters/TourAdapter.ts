import type {
	SellableUnitAdapterPort,
	SearchContext,
} from "../../application/ports/SellableUnitAdapterPort"
import type {
	InventorySnapshot,
	PriceRuleSnapshot,
	RatePlanSnapshot,
	SearchUnit,
} from "../../domain/unit.types"
import type { RestrictionRow, RestrictionContext } from "../../domain/restrictions.types"
import type { Promotion } from "../../domain/promotions.types"

/**
 * Tour sellable-unit adapter.
 * Same commercial spine as hotels; stay window is 1 day via tourDepartureToStay on the PDP.
 */
export class TourAdapter implements SellableUnitAdapterPort<SearchUnit> {
	constructor(
		private deps: {
			inventoryRepo: {
				getEffectiveRange(variantId: string, from: Date, to: Date): Promise<InventorySnapshot[]>
			}
			ratePlanRepo: { getActiveByVariant(variantId: string): Promise<RatePlanSnapshot[]> }
			restrictionRepo: {
				loadActiveRules(input: RestrictionContext): Promise<RestrictionRow[]>
			}
			priceRuleRepo: { getActive(ratePlanId: string): Promise<PriceRuleSnapshot[]> }
		}
	) {}

	async loadInventory(ctx: SearchContext<SearchUnit>) {
		return this.deps.inventoryRepo.getEffectiveRange(ctx.unitId, ctx.checkIn, ctx.checkOut)
	}

	async loadRatePlans(ctx: SearchContext<SearchUnit>) {
		return this.deps.ratePlanRepo.getActiveByVariant(ctx.unitId)
	}

	async loadPriceRules(ctx: SearchContext<SearchUnit>) {
		const ratePlans = await this.loadRatePlans(ctx)
		const rules = await Promise.all(ratePlans.map((rp) => this.deps.priceRuleRepo.getActive(rp.id)))
		return rules.flat()
	}

	async loadRestrictions(ctx: SearchContext<SearchUnit>) {
		const nights = Math.max(
			1,
			Math.ceil((ctx.checkOut.getTime() - ctx.checkIn.getTime()) / (1000 * 60 * 60 * 24))
		)

		const baseRules = await this.deps.restrictionRepo.loadActiveRules({
			productId: ctx.productId ?? undefined,
			variantId: ctx.unitId,
			checkIn: ctx.checkIn,
			checkOut: ctx.checkOut,
			nights,
		})

		const ratePlans = await this.loadRatePlans(ctx)
		const ratePlanRules = await Promise.all(
			ratePlans.map((rp) =>
				this.deps.restrictionRepo.loadActiveRules({
					productId: "",
					variantId: "",
					ratePlanId: rp.id,
					checkIn: ctx.checkIn,
					checkOut: ctx.checkOut,
					nights,
				})
			)
		)

		return [...baseRules, ...ratePlanRules.flat()]
	}

	async loadPromotions(_ctx: SearchContext<SearchUnit>): Promise<Promotion[]> {
		return []
	}
}
