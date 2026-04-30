export interface RatePlanContext {
	variantId: string
	basePrice: number
	checkIn: Date
	checkOut: Date
}

export interface SelectedRatePlan {
	id: string
	name: string
	price: number
	priority: number
}

export interface PriceRule {
	id: string
	ratePlanId: string
	occupancyKey?: string | null
	type: "modifier" | "fixed_adjustment" | "override" | "percentage_discount" | "percentage_markup"
	value: number
	startDate?: Date | null
	endDate?: Date | null
	isActive: boolean
}
