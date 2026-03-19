export type RestrictionScope = "product" | "variant" | "rate_plan"

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

export type RestrictionRow = StopSellRow | MinLosRow | MinLeadRow | MaxLeadRow

export type StopSellParams = {}
export type MinLosParams = { nights: number }
export type BookingWindowParams = { minDays?: number; maxDays?: number }

export type RestrictionParamsMap = {
	stop_sell: StopSellParams
	open_sell: StopSellParams

	min_los: MinLosParams
	max_los: MinLosParams

	min_lead_time: BookingWindowParams
	max_lead_time: BookingWindowParams

	cta: {}
	ctd: {}
}

export type RestrictionContext = {
	productId: string
	variantId?: string
	ratePlanId?: string
	checkIn: Date
	checkOut: Date
	nights: number
}
export type RestrictionKey = keyof RestrictionParamsMap

export type RestrictionResult = { allowed: true } | { allowed: false; reason: string }
