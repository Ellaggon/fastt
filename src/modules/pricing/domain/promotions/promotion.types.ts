export type PromotionType = "percentage" | "fixed" | "early_bird" | "last_minute"

export interface Promotion {
	id: string
	type: PromotionType
	value: number
	startDate: Date
	endDate: Date
	combinable: boolean
	minNights?: number
	daysBeforeCheckIn?: number
}
