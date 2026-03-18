export interface SearchContext {
	productId: string
	unitId: string
	unitType: "hotel_room" | "tour_slot" | "package_base"
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
	basePrice: number
}

export interface SellableUnitAdapter {
	loadInventory(ctx: SearchContext): Promise<any[]>
	loadRatePlans(ctx: SearchContext): Promise<any[]>
	loadPriceRules(ctx: SearchContext): Promise<any[]>
	loadRestrictions(ctx: SearchContext): Promise<any[]>
	loadPromotions(ctx: SearchContext): Promise<any[]>
}
