import type { PriceRuleSnapshot } from "../../domain/unit.types"

export interface PricingPort {
	/**
	 * Strict pricing computation for Search.
	 *
	 * IMPORTANT:
	 * - Must match preview semantics exactly (same rule model and validation).
	 * - Rule types allowed: "percentage" | "fixed" only.
	 * - Ordering MUST be deterministic (caller provides ordered rules).
	 */
	computeStayBasePriceWithRulesStrict(params: {
		basePricePerNight: number
		nights: number
		priceRules: PriceRuleSnapshot[]
	}): number
}
