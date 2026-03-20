import type { AppliedPriceRule, Currency, PriceResult } from "../../domain/pricing.types"
import type { PriceRuleSnapshot } from "../../domain/unit.types"

export interface PricingPort {
	adaptPriceRule(dbRule: PriceRuleSnapshot | null): AppliedPriceRule | null
	computeStay(params: {
		basePrice: number
		nights: number
		rules: AppliedPriceRule[]
		currency: Currency
	}): PriceResult
}
