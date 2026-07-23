export type RatePlanPricingSummary = {
	ratePlanId: string
	currency: string
	basePrice: number
	effectivePricingDays: number
	coverageOccupancyKey: string
	conditionsSummary?: {
		conditionsComplete: boolean
		totalCategories: number
		coveredCategories: number
		missingCategories: string[]
		policyCoverageUpdatedAt: Date | string | null
		summary: string
	}
}

export type RatePlanPricingModifierSummary = {
	id: string
	name: string
	isDefault: boolean
	isActive: boolean
	activeModifiers: number
}

export type PricingRuleUiSummary = {
	id: string
	name: string | null
	type: string
	value: number
	priority: number
	dateFrom: string | null
	dateTo: string | null
	dayOfWeek: number[]
	hasInvalidDateRange: boolean
	contextKey: "season" | "promotion" | "day" | "manual"
}

export interface RatePlanPricingReadRepositoryPort {
	getDefaultRatePlanPricingSummaryByVariant(
		variantId: string
	): Promise<RatePlanPricingSummary | null>
	getRatePlanPricingSummary(ratePlanId: string): Promise<RatePlanPricingSummary | null>
	listRatePlanPricingSummaries(ratePlanIds: string[]): Promise<RatePlanPricingSummary[]>
	listRatePlanModifierSummaryByVariant(variantId: string): Promise<RatePlanPricingModifierSummary[]>
	listActiveRulesForRatePlan(ratePlanId: string): Promise<PricingRuleUiSummary[]>
}
