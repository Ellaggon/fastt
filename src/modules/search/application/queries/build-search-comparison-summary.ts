import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import type { SearchSellabilityDTO } from "../dto/SearchSellabilityDTO"

export function buildSearchComparisonSummary(input: {
	offers: SearchOffer<SearchUnit>[]
	sellabilityByRatePlan: Record<string, SearchSellabilityDTO>
}): {
	offersCount: number
	variantIds: string[]
	ratePlanCounts: number[]
	decisions: Array<{
		key: string
		isSellable: boolean
		reasonCodes: string[]
		priceDisplay: { amount: number | null; currency: string | null }
	}>
} {
	const decisionEntries = Object.entries(input.sellabilityByRatePlan)
		.map(([key, dto]) => ({
			key,
			isSellable: Boolean(dto.isSellable),
			reasonCodes: [...dto.reasonCodes.map((reason) => String(reason))].sort(),
			priceDisplay: {
				amount: dto.price.display == null ? null : Number(dto.price.display.amount),
				currency: dto.price.display == null ? null : String(dto.price.display.currency),
			},
		}))
		.sort((a, b) => a.key.localeCompare(b.key))

	return {
		offersCount: input.offers.length,
		variantIds: input.offers.map((offer) => String(offer.variantId)).sort(),
		ratePlanCounts: input.offers.map((offer) => offer.ratePlans.length),
		decisions: decisionEntries,
	}
}
