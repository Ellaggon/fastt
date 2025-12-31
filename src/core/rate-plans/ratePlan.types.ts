export interface RatePlanContext {
	variantId: string
	checkIn: Date
	checkOut: Date
}

export interface SelectedRatePlan {
	id: string
	name: string
	type: string
	priority: number
	isDefault: boolean
}
