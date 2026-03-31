import type { AppliedPriceRule } from "../../domain/pricing.types"

export interface PricingRepositoryPort {
	getRules(ratePlanId: string): Promise<AppliedPriceRule[]>
	/**
	 * Minimal, deterministic rule loader for CAPA 4B preview.
	 *
	 * IMPORTANT:
	 * - Only active rules are returned
	 * - Ordering is deterministic: createdAt ASC (and id ASC as tie-breaker)
	 * - Callers MUST validate allowed rule types at the use-case layer
	 */
	getPreviewRules(
		ratePlanId: string
	): Promise<Array<{ id: string; type: string; value: number; createdAt: Date }>>
	saveEffectivePrice(params: {
		variantId: string
		ratePlanId: string
		date: string
		basePrice: number
		finalBasePrice: number
	}): Promise<void>
}
