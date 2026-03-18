import { calculatePrice } from "./pricing.engine"
import type { AppliedPriceRule, Currency } from "./pricing.types"

export class PricingEngine {
	computeDaily(params: { basePrice: number; rules: AppliedPriceRule[]; currency: Currency }) {
		return calculatePrice({ basePrice: params.basePrice }, params.rules, params.currency)
	}

	computeStay(params: {
		basePrice: number
		nights: number
		rules: AppliedPriceRule[]
		currency: Currency
	}) {
		return calculatePrice(
			{ basePrice: params.basePrice * params.nights },
			params.rules,
			params.currency
		)
	}
}
