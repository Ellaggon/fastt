import {
	BuildOffersUseCase,
	SearchContextLoader,
	SearchPipeline,
	type SearchOffer,
	type SearchUnit,
} from "@/modules/search/public"

import { AdapterRegistry as SearchAdapterRegistry } from "../modules/search/infrastructure/AdapterRegistry"
import { HotelAdapter } from "../modules/search/infrastructure/adapters/HotelAdapter"
import { VariantQueryAdapter } from "../modules/search/infrastructure/adapters/VariantQueryAdapter"
import { PricingPortAdapter } from "../modules/search/infrastructure/adapters/PricingPortAdapter"
import { PromotionPortAdapter } from "../modules/search/infrastructure/adapters/PromotionPortAdapter"
import { RestrictionPortAdapter } from "../modules/search/infrastructure/adapters/RestrictionPortAdapter"

import { dailyInventoryRepository } from "./inventory.container"
import {
	priceRuleRepository,
	promotionEngine,
	ratePlanRepository,
	variantRepository,
} from "./pricing.container"
import { computeBasePriceWithRules, parseStrictMinimalRules } from "@/modules/pricing/public"
import { restrictionRepository, restrictionRuleEngine } from "./policies.container"

// ---- Search singletons ----
export const searchAdapterRegistry = new SearchAdapterRegistry<SearchUnit>()

export const hotelAdapter = new HotelAdapter({
	inventoryRepo: dailyInventoryRepository,
	ratePlanRepo: ratePlanRepository,
	restrictionRepo: restrictionRepository,
	priceRuleRepo: priceRuleRepository,
})
searchAdapterRegistry.register("hotel_room", hotelAdapter)

export const searchContextLoader = new SearchContextLoader<SearchUnit>(searchAdapterRegistry)

const searchPricingPort = new PricingPortAdapter({
	computeStayBasePriceWithRulesStrict: ({ basePricePerNight, nights, priceRules }) => {
		const stayBase = basePricePerNight * nights

		// Ensure identical semantics with preview: strict rule model.
		const minimal = parseStrictMinimalRules({
			basePrice: stayBase,
			rules: priceRules.map((r) => ({
				id: r.id,
				type: String(r.type),
				value: Number(r.value),
			})),
		})

		return computeBasePriceWithRules(stayBase, minimal)
	},
})
const searchRestrictionPort = new RestrictionPortAdapter({
	restrictionEngine: restrictionRuleEngine,
})
const searchPromotionPort = new PromotionPortAdapter({
	promotionEngine,
})

export const searchPipeline = new SearchPipeline<SearchUnit>(searchContextLoader, undefined, {
	restrictions: searchRestrictionPort,
	pricing: searchPricingPort,
	promotions: searchPromotionPort,
})

export const variantQueryAdapter = new VariantQueryAdapter<SearchUnit>(variantRepository)

export const buildOffers = new BuildOffersUseCase<SearchUnit>({
	variantQuery: variantQueryAdapter,
	searchPipeline,
})

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	adults: number
	children: number
}): Promise<SearchOffer<SearchUnit>[]> {
	return buildOffers.execute(params)
}
