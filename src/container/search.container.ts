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
	adaptPriceRule,
	priceRuleRepository,
	pricingEngine,
	promotionEngine,
	ratePlanRepository,
	variantRepository,
} from "./pricing.container"
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
	adaptPriceRule,
	pricingEngine,
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
