import type { SearchUnit } from "@/modules/search/public"

export type SearchUnitViewRow = {
	variantId: string
	ratePlanId: string
	date: string
	isAvailable: boolean
	hasAvailability: boolean
	hasPrice: boolean
	availableUnits: number
	pricePerNight: number | null
	minStay: number | null
	maxStay?: number | null
	minLeadTime?: number | null
	maxLeadTime?: number | null
	cta: boolean
	ctd: boolean
	primaryBlocker: string | null
}

export type SearchOffersRepositoryPort = {
	listActiveUnitsByProduct(productId: string): Promise<SearchUnit[]>
	listSearchUnitViewRows(params: {
		unitIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<SearchUnitViewRow[]>
	listEffectivePricingV2Rows?(params: {
		unitIds: string[]
		ratePlanIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<
		Array<{
			variantId: string
			ratePlanId: string
			date: string
			finalBasePrice: number
			baseComponent?: number
			occupancyAdjustment?: number
			ruleAdjustment?: number
		}>
	>
}
