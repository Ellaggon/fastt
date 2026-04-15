import type {
	SellableUnitAdapterPort,
	SearchContext,
} from "../../application/ports/SellableUnitAdapterPort"
import type {
	InventorySnapshot,
	PriceRuleSnapshot,
	RatePlanSnapshot,
} from "../../domain/unit.types"
import type { SearchUnit } from "../../domain/unit.types"
import type { RestrictionRow, RestrictionContext } from "../../domain/restrictions.types"
import type { Promotion } from "../../domain/promotions.types"

export class HotelAdapter implements SellableUnitAdapterPort<SearchUnit> {
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
		const nights = Math.ceil(
			(ctx.checkOut.getTime() - ctx.checkIn.getTime()) / (1000 * 60 * 60 * 24)
		)

		// Load product/variant scoped rules once.
		const baseRules = await this.deps.restrictionRepo.loadActiveRules({
			productId: ctx.productId ?? undefined,
			variantId: ctx.unitId,
			checkIn: ctx.checkIn,
			checkOut: ctx.checkOut,
			nights,
		})

		// Also load rate-plan scoped rules (if any) for each active plan.
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

	async loadPromotions(ctx: SearchContext<SearchUnit>): Promise<Promotion[]> {
		return [] // hasta que tengas repo real
	}
}
