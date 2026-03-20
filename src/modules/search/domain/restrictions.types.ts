export type RestrictionScope = "product" | "variant" | "rate_plan"

interface BaseRow {
	id: string
	scope: RestrictionScope
	scopeId: string
	startDate: Date
	endDate: Date
	validDays?: number[] | null
	isActive: boolean
	priority: number
}

export interface StopSellRow extends BaseRow {
	type: "stop_sell"
	value: null
}
export interface MinLosRow extends BaseRow {
	type: "min_los"
	value: number
}
export interface MinLeadRow extends BaseRow {
	type: "min_lead_time"
	value: number
}
export interface MaxLeadRow extends BaseRow {
	type: "max_lead_time"
	value: number
}

export type RestrictionRow = StopSellRow | MinLosRow | MinLeadRow | MaxLeadRow

export type RestrictionContext = {
	productId: string
	variantId?: string
	ratePlanId?: string
	checkIn: Date
	checkOut: Date
	nights: number
}

export type RestrictionResult = { allowed: true } | { allowed: false; reason: string }
