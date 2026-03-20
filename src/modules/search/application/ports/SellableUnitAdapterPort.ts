import type {
	InventorySnapshot,
	PriceRuleSnapshot,
	RatePlanSnapshot,
	UnitType,
} from "../../domain/unit.types"
import type { SellableUnit } from "../../domain/unit.types"
import type { RestrictionRow } from "../../domain/restrictions.types"
import type { Promotion } from "../../domain/promotions.types"

export interface SearchContext<TUnit extends SellableUnit = SellableUnit> {
	productId: string
	unitId: TUnit["id"]
	unitType: UnitType
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
	basePrice: number
}

export interface SellableUnitAdapterPort<TUnit extends SellableUnit = SellableUnit> {
	loadInventory(ctx: SearchContext<TUnit>): Promise<InventorySnapshot[]>
	loadRatePlans(ctx: SearchContext<TUnit>): Promise<RatePlanSnapshot[]>
	loadPriceRules(ctx: SearchContext<TUnit>): Promise<PriceRuleSnapshot[]>
	loadRestrictions(ctx: SearchContext<TUnit>): Promise<RestrictionRow[]>
	loadPromotions(ctx: SearchContext<TUnit>): Promise<Promotion[]>
}
