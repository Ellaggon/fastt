import {
	adaptPriceRule,
	PricingComputationService,
	PricingEngine,
	PromotionEngine,
	RatePlanEngine,
	RatePlanService,
} from "@/modules/pricing/public"

import {
	createGetVariantByIdQuery,
	createGetRatePlanByIdQuery,
	createListRatePlansByVariantQuery,
} from "../modules/pricing/application/queries"
import { PricingRepository } from "../modules/pricing/infrastructure/repositories/PricingRepository"
import { RatePlanRepository } from "../modules/pricing/infrastructure/repositories/RatePlanRepository"
import { VariantRepository } from "../modules/pricing/infrastructure/repositories/VariantRepository"
import { PriceRuleRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleRepository"
import { RatePlanCommandRepository } from "../modules/pricing/infrastructure/repositories/RatePlanCommandRepository"
import { RatePlanQueryRepository } from "../modules/pricing/infrastructure/repositories/RatePlanQueryRepository"

// ---- Infrastructure singletons ----
export const pricingRepository = new PricingRepository()
export const ratePlanRepository = new RatePlanRepository()
export const variantRepository = new VariantRepository()
export const priceRuleRepository = new PriceRuleRepository()
export const ratePlanCommandRepository = new RatePlanCommandRepository()
export const ratePlanQueryRepository = new RatePlanQueryRepository()

// ---- Engine singletons ----
export const ratePlanEngine = new RatePlanEngine()
export const pricingEngine = new PricingEngine()
export const promotionEngine = new PromotionEngine()

// ---- Service singletons ----
export const ratePlanService = new RatePlanService({
	variantRepo: variantRepository,
	ratePlanRepo: ratePlanRepository,
	priceRuleRepo: priceRuleRepository,
	ratePlanEngine,
})

export const pricingComputationService = new PricingComputationService(
	pricingRepository,
	pricingEngine
)

// ---- Wired read queries ----
export const getVariantById = createGetVariantByIdQuery({ repo: variantRepository })
export const getRatePlanById = createGetRatePlanByIdQuery({ repo: ratePlanQueryRepository })
export const listRatePlansByVariant = createListRatePlansByVariantQuery({
	repo: ratePlanQueryRepository,
})

// ---- Helpers (used by other containers) ----
export { adaptPriceRule }
