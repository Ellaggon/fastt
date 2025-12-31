export interface PricingContext {
	basePriceUSD: number
	basePriceBOB: number
	nights: number
}

export type RatePlanType = "base" | "fixed" | "modifier" | "package" | "percentage"

export interface AppliedRatePlan {
	id: string
	type: RatePlanType
	valueUSD: number
	valueBOB: number
}

export interface PriceResult {
	currency: "USD" | "BOB"
	base: number
	adjustments: number
	total: number
	breakdown: PriceBreakdown[]
}

export interface PriceBreakdown {
	label: string
	amount: number
}
