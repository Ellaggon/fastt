// Public API for the pricing module.
// External consumers MUST import from "@/modules/pricing/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain
export * from "./domain/pricing.types"
export * from "./domain/pricing.utils"
export * from "./domain/computeBasePriceWithRules"
export * from "./domain/strictMinimalRules"
export * from "./domain/evaluatePricingRules"
export * from "./domain/adapters/adapter.priceRule"
export * from "./domain/promotions/PromotionEngine"
export * from "./domain/promotions/promotion.rules"
export * from "./domain/promotions/promotion.types"
export * from "./domain/rate-plans/ratePlan.priority"
export * from "./domain/rate-plans/ratePlan.types"

// Application use-cases
export * from "./application/use-cases/build-create-rateplan-spec"
export * from "./application/use-cases/create-rateplan"
export * from "./application/use-cases/set-base-rate"
export * from "./application/use-cases/compute-price-preview"
export * from "./application/use-cases/ensure-default-rateplan"
export * from "./application/use-cases/create-default-price-rule"
export * from "./application/use-cases/update-default-price-rule"
export * from "./application/use-cases/list-default-price-rules"
export * from "./application/use-cases/delete-price-rule"
export * from "./application/use-cases/preview-pricing-rules"
export type { RatePlanPricingContext } from "./application/use-cases/rate-plan-pricing-surface"
export * from "./application/use-cases/get-rateplan-owner-context"
export * from "./application/use-cases/bulk-pricing-service"

// Application ports
export * from "./application/ports/PricingRepositoryPort"
export * from "./application/ports/RatePlanRepositoryPort"
export * from "./application/ports/VariantRepositoryPort"
export * from "./application/ports/PriceRuleRepositoryPort"
export * from "./application/ports/RatePlanCommandRepositoryPort"
export * from "./application/ports/index"

// Runtime queries (wired in container). Async wrapper to avoid eager container/DB load in unit tests.
export async function getVariantById(variantId: string) {
	const { getVariantById } = await import("@/container")
	return getVariantById(variantId)
}

export async function getRatePlanById(ratePlanId: string) {
	const { getRatePlanById } = await import("@/container")
	return getRatePlanById(ratePlanId)
}

export async function listRatePlansByVariant(variantId: string) {
	const { listRatePlansByVariant } = await import("@/container")
	return listRatePlansByVariant(variantId)
}

export async function listRatePlansByProvider(providerId: string) {
	const { listRatePlansByProvider } = await import("@/container")
	return listRatePlansByProvider(providerId)
}

export async function resolveRatePlanOwnerContext(ratePlanId: string) {
	const { getRatePlanOwnerContext } = await import(
		"./application/use-cases/get-rateplan-owner-context"
	)
	const { ratePlanOwnerContextRepository } = await import("@/container")
	return getRatePlanOwnerContext({ repo: ratePlanOwnerContextRepository }, { ratePlanId })
}

export async function resolveRatePlanPricingContext(params: {
	providerId: string
	ratePlanId: string
}) {
	const { resolveRatePlanPricingContext } = await import("@/container")
	return resolveRatePlanPricingContext(params)
}

export async function ensurePricingCoverageRuntime(params: {
	variantId: string
	ratePlanId: string
	from: string
	to: string
	recomputeExisting?: boolean
}) {
	const { ensurePricingCoverage } = await import("./application/use-cases/ensure-pricing-coverage")
	const { pricingRepository, variantManagementRepository } = await import("@/container")
	const result = await ensurePricingCoverage(
		{
			pricingRepo: pricingRepository,
			variantRepo: variantManagementRepository,
		},
		params
	)
	try {
		const { materializeSearchUnitRange } = await import("@/modules/search/public")
		await materializeSearchUnitRange({
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			from: params.from,
			to: params.to,
			currency: "USD",
		})
	} catch (error) {
		console.warn("search_unit_materialization_failed", {
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			from: params.from,
			to: params.to,
			message: error instanceof Error ? error.message : String(error),
		})
	}
	return result
}
