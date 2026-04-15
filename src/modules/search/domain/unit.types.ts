import type { RestrictionRow } from "./restrictions.types"
import type { Promotion } from "./promotions.types"

export const UNIT_TYPES = ["hotel_room", "tour_slot", "package_base"] as const

export type UnitType = (typeof UNIT_TYPES)[number]

export function isUnitType(value: string): value is UnitType {
	return UNIT_TYPES.includes(value as UnitType)
}

// Base domain contract for "sellable units" (variants).
export interface SellableUnit {
	id: string
	kind: UnitType
	pricing: {
		basePrice: number
		currency: string
	}
	capacity?: {
		minOccupancy: number
		maxOccupancy: number
	}
}

export interface HotelRoomUnit extends SellableUnit {
	productId: string
}

export interface TourSlotUnit extends SellableUnit {
	productId: string
}

export interface PackageBaseUnit extends SellableUnit {
	productId: string
}

// Variants returned by the VariantQuery adapter for the search pipeline.
export type SearchUnit = SellableUnit & {
	productId: string
}

export type InventorySnapshot = {
	date: string | Date
	availableUnits: number
	isSellable: boolean
	stopSell?: boolean
}

export type RatePlanSnapshot = {
	id: string
	// Keep room for additional fields without losing typing safety.
	[key: string]: unknown
}

export type PriceRuleSnapshot = {
	id: string
	ratePlanId: string
	type: string
	value?: unknown
	startDate?: unknown
	endDate?: unknown
	isActive: boolean
}

export interface SearchMemory {
	inventory: InventorySnapshot[]
	ratePlans: RatePlanSnapshot[]
	restrictions?: RestrictionRow[]
	priceRules?: PriceRuleSnapshot[]
	promotions?: Promotion[]
}
