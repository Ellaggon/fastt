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
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import { restrictionRepository, restrictionRuleEngine } from "./policies.container"
import { resolveEffectiveTaxFeesUseCase } from "./taxes-fees.container"
import { and, db, EffectivePricing, eq, gte, lt } from "astro:db"
import { toISODate } from "@/shared/domain/date/date.utils"

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

function enumerateStayDates(checkIn: Date, checkOut: Date): string[] {
	const dates: string[] = []
	const cursor = new Date(checkIn)
	while (cursor < checkOut) {
		dates.push(toISODate(cursor))
		cursor.setDate(cursor.getDate() + 1)
	}
	return dates
}

export const searchPipeline = new SearchPipeline<SearchUnit>(searchContextLoader, undefined, {
	restrictions: searchRestrictionPort,
	promotions: searchPromotionPort,
	taxes: searchTaxFeePort,
	effectivePricing: {
		async getEffectiveTotalForRange(params) {
			const from = toISODate(params.checkIn)
			const to = toISODate(params.checkOut)
			const expectedDates = enumerateStayDates(params.checkIn, params.checkOut)
			const rows = await db
				.select({
					date: EffectivePricing.date,
					finalBasePrice: EffectivePricing.finalBasePrice,
				})
				.from(EffectivePricing)
				.where(
					and(
						eq(EffectivePricing.variantId, params.variantId),
						eq(EffectivePricing.ratePlanId, params.ratePlanId),
						gte(EffectivePricing.date, from),
						lt(EffectivePricing.date, to)
					)
				)
				.all()
			const priceByDate = new Map(rows.map((row) => [String(row.date), Number(row.finalBasePrice)]))
			const missingDates = expectedDates.filter((date) => !priceByDate.has(date))
			if (missingDates.length > 0) {
				return { total: null, missingDates }
			}
			const total = expectedDates.reduce((sum, date) => sum + Number(priceByDate.get(date) ?? 0), 0)
			return { total, missingDates: [] }
		},
	},
	coverage: {
		async ensureCoverage(params) {
			const { ensurePricingCoverageRuntime } = await import("@/modules/pricing/public")
			await ensurePricingCoverageRuntime({
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				from: toISODate(params.checkIn),
				to: toISODate(params.checkOut),
			})
		},
	},
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
