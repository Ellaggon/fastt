export const UNIT_TYPES = ["hotel_room", "tour_slot", "package_base"] as const

export type UnitType = (typeof UNIT_TYPES)[number]

export function isUnitType(value: string): value is UnitType {
	return UNIT_TYPES.includes(value as UnitType)
}

export interface SearchMemory {
	inventory: any[]
	ratePlans: any[]
	restrictions?: any[]
	priceRules?: any[]
	promotions?: any[]
}
