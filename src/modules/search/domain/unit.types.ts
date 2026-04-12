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
	entityType: string
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
	entityId: string
}

export interface TourSlotUnit extends SellableUnit {
	productId: string
	entityId: string
}

export interface PackageBaseUnit extends SellableUnit {
	productId: string
	entityId: string
}

// Variants returned by the VariantQuery adapter for the search pipeline.
// `entityType` is intentionally `string` because it comes from persistence and
// is narrowed to `UnitType` at runtime via `isUnitType(...)`.
export type SearchUnit = SellableUnit & {
	productId: string
	entityId: string
}

export type InventorySnapshot = {
	date: string | Date
	totalInventory: number
	reservedCount: number
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
