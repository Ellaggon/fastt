import { adaptPriceRule, PromotionEngine } from "@/modules/pricing/public"

import {
	createGetVariantByIdQuery,
	createGetRatePlanByIdQuery,
	createListRatePlansByVariantQuery,
	createListRatePlansByProviderQuery,
} from "../modules/pricing/application/queries"
import { createResolveRatePlanPricingContext } from "../modules/pricing/application/use-cases/rate-plan-pricing-surface"
import { PricingRepository } from "../modules/pricing/infrastructure/repositories/PricingRepository"
import { RatePlanRepository } from "../modules/pricing/infrastructure/repositories/RatePlanRepository"
import { VariantRepository } from "../modules/pricing/infrastructure/repositories/VariantRepository"
import { PriceRuleRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleRepository"
import { RatePlanCommandRepository } from "../modules/pricing/infrastructure/repositories/RatePlanCommandRepository"
import { RatePlanQueryRepository } from "../modules/pricing/infrastructure/repositories/RatePlanQueryRepository"
import { BaseRateRepository } from "../modules/pricing/infrastructure/repositories/BaseRateRepository"
import { PriceRuleCommandRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleCommandRepository"
import { PriceRuleQueryRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleQueryRepository"
import { RatePlanOwnerContextRepository } from "../modules/pricing/infrastructure/repositories/RatePlanOwnerContextRepository"
import { RatePlanPricingContextRepository } from "../modules/pricing/infrastructure/repositories/RatePlanPricingContextRepository"

// ---- Infrastructure singletons ----
export const pricingRepository = new PricingRepository()
export const ratePlanRepository = new RatePlanRepository()
export const variantRepository = new VariantRepository()
export const priceRuleRepository = new PriceRuleRepository()
export const ratePlanCommandRepository = new RatePlanCommandRepository()
export const ratePlanQueryRepository = new RatePlanQueryRepository()
export const baseRateRepository = new BaseRateRepository()
export const priceRuleCommandRepository = new PriceRuleCommandRepository()
export const priceRuleQueryRepository = new PriceRuleQueryRepository()
export const ratePlanOwnerContextRepository = new RatePlanOwnerContextRepository()
export const ratePlanPricingContextRepository = new RatePlanPricingContextRepository()

// ---- Engine singletons ----
export const promotionEngine = new PromotionEngine()

// ---- Wired read queries ----
export const getVariantById = createGetVariantByIdQuery({ repo: variantRepository })
export const getRatePlanById = createGetRatePlanByIdQuery({ repo: ratePlanQueryRepository })
export const listRatePlansByVariant = createListRatePlansByVariantQuery({
	repo: ratePlanQueryRepository,
})
export const listRatePlansByProvider = createListRatePlansByProviderQuery({
	repo: ratePlanQueryRepository,
})
export const resolveRatePlanPricingContext = createResolveRatePlanPricingContext({
	repo: ratePlanPricingContextRepository,
})

// ---- Helpers (used by other containers) ----
export { adaptPriceRule }
