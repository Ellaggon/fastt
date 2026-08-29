import { adaptPriceRule } from "../modules/pricing/domain/adapters/adapter.priceRule"
import { PromotionEngine } from "../modules/pricing/domain/promotions/PromotionEngine"
import { ensurePricingCoverage } from "../modules/pricing/application/use-cases/ensure-pricing-coverage"

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
import { EffectivePricingRepository } from "../modules/pricing/infrastructure/repositories/EffectivePricingRepository"
import { RatePlanCommandRepository } from "../modules/pricing/infrastructure/repositories/RatePlanCommandRepository"
import { RatePlanQueryRepository } from "../modules/pricing/infrastructure/repositories/RatePlanQueryRepository"
import { BaseRateRepository } from "../modules/pricing/infrastructure/repositories/BaseRateRepository"
import { PriceRuleCommandRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleCommandRepository"
import { PriceRuleQueryRepository } from "../modules/pricing/infrastructure/repositories/PriceRuleQueryRepository"
import { RatePlanOwnerContextRepository } from "../modules/pricing/infrastructure/repositories/RatePlanOwnerContextRepository"
import { RatePlanPricingContextRepository } from "../modules/pricing/infrastructure/repositories/RatePlanPricingContextRepository"
import { RatePlanPricingReadRepository } from "../modules/pricing/infrastructure/repositories/RatePlanPricingReadRepository"
import { PricingRuleCommandService } from "../modules/pricing/application/use-cases/pricing-rule-command-service"
import { createCommercialPriceRule } from "@/lib/commercial-rules/commercialRulesRepository"
import { listRulesByRatePlan } from "@/lib/pricing/rules-v2"
import { invalidatePricing } from "@/lib/cache/invalidation"
import { enqueueProviderIncrementalAriChangeSoft } from "@/lib/channel-manager/channel-manager-incremental-queue"

// ---- Infrastructure singletons ----
export const pricingRepository = new PricingRepository()
export const effectivePricingRepository = new EffectivePricingRepository()
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
export const ratePlanPricingReadRepository = new RatePlanPricingReadRepository()

export const pricingRuleCommandService = new PricingRuleCommandService({
	getPricingSummary: (ratePlanId) =>
		ratePlanPricingReadRepository.getRatePlanPricingSummary(ratePlanId),
	getFallbackCurrency: (ratePlanId) => effectivePricingRepository.getFallbackCurrency(ratePlanId),
	listRules: listRulesByRatePlan,
	createRule: createCommercialPriceRule,
	rematerialize: async ({ variantId, ratePlanId, from, to, occupancy, fallbackCurrency }) => {
		const { variantManagementRepository } = await import("./catalog.container")
		return ensurePricingCoverage(
			{
				pricingRepo: pricingRepository,
				variantRepo: variantManagementRepository,
				effectivePricingRepo: effectivePricingRepository,
			},
			{
				variantId,
				ratePlanId,
				from,
				to,
				recomputeExisting: true,
				occupancy,
				fallbackCurrency,
			}
		)
	},
	invalidatePricing: ({ variantId, ratePlanId }) => invalidatePricing({ variantId, ratePlanId }),
	enqueueAri: ({ variantId, ratePlanId, from, toExclusive }) =>
		enqueueProviderIncrementalAriChangeSoft({
			domain: "rates_restrictions",
			variantIds: [variantId],
			ratePlanIds: [ratePlanId],
			from,
			toExclusive,
		}),
})

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
