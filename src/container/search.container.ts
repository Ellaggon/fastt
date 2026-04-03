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
import { TaxFeePortAdapter } from "../modules/search/infrastructure/adapters/TaxFeePortAdapter"

import { dailyInventoryRepository } from "./inventory.container"
import {
	priceRuleRepository,
	promotionEngine,
	ratePlanRepository,
	variantRepository,
} from "./pricing.container"
import { computeBasePriceWithRules, parseStrictMinimalRules } from "@/modules/pricing/public"
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import { restrictionRepository, restrictionRuleEngine } from "./policies.container"
import { resolveEffectiveTaxFeesUseCase } from "./taxes-fees.container"

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
const searchTaxFeePort = new TaxFeePortAdapter({
	resolveEffectiveTaxFees: resolveEffectiveTaxFeesUseCase,
	computeTaxBreakdown,
})

export const searchPipeline = new SearchPipeline<SearchUnit>(searchContextLoader, undefined, {
	restrictions: searchRestrictionPort,
	pricing: searchPricingPort,
	promotions: searchPromotionPort,
	taxes: searchTaxFeePort,
})

export const variantQueryAdapter = new VariantQueryAdapter<SearchUnit>({
	async getActiveByProduct(productId: string) {
		const rows = await variantRepository.getActiveByProduct(productId)
		return rows.map((v) => ({
			id: v.id,
			productId: v.productId,
			entityType: v.entityType,
			entityId: v.entityId,
			pricing: v.pricing,
			capacity: v.capacity,
		}))
	},
})

export const buildOffers = new BuildOffersUseCase<SearchUnit>({
	variantQuery: variantQueryAdapter,
	searchPipeline,
})

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
}): Promise<SearchOffer<SearchUnit>[]> {
	return buildOffers.execute(params)
}
