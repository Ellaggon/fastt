export type Currency = "USD" | "BOB"

export interface PricingContext {
	basePrice: number
	nights?: number
}

export type RuntimePriceRuleType = "fixed" | "modifier" | "percentage"

export interface RuntimePriceRule {
	type: RuntimePriceRuleType
	value: number
}

export interface AppliedPriceRule {
	id: string
	rule: RuntimePriceRule
}

export interface PriceBreakdown {
	label: string
	amount: number
}

export interface PriceResult {
	currency: Currency
	base: number
	adjustments: number
	total: number
	breakdown: PriceBreakdown[]
	appliedRules?: AppliedPriceRule[]
}
