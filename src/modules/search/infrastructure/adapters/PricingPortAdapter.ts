import type { PricingPort } from "../../application/ports/PricingPort"
import type { AppliedPriceRule, Currency, PriceResult } from "../../domain/pricing.types"
import type { PriceRuleSnapshot } from "../../domain/unit.types"

export class PricingPortAdapter implements PricingPort {
	constructor(
		private deps: {
			adaptPriceRule(dbRule: PriceRuleSnapshot | null): AppliedPriceRule | null
			pricingEngine: {
				computeStay(params: {
					basePrice: number
					nights: number
					rules: AppliedPriceRule[]
					currency: Currency
				}): PriceResult
			}
		}
	) {}

	adaptPriceRule(dbRule: PriceRuleSnapshot | null) {
		return this.deps.adaptPriceRule(dbRule)
	}

	computeStay(params: {
		basePrice: number
		nights: number
		rules: AppliedPriceRule[]
		currency: Currency
	}) {
		return this.deps.pricingEngine.computeStay(params)
	}
}
