import type { PricingPort } from "../../application/ports/PricingPort"
import type { PriceRuleSnapshot } from "../../domain/unit.types"

export class PricingPortAdapter implements PricingPort {
	constructor(
		private deps: {
			// Strict shared computation injected from the pricing module.
			computeStayBasePriceWithRulesStrict(params: {
				basePricePerNight: number
				nights: number
				priceRules: PriceRuleSnapshot[]
			}): number
		}
	) {}

	computeStayBasePriceWithRulesStrict(params: {
		basePricePerNight: number
		nights: number
		priceRules: PriceRuleSnapshot[]
	}) {
		return this.deps.computeStayBasePriceWithRulesStrict(params)
	}
}
