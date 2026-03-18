import { roundMoney } from "./pricing.utils"
import type { PricingContext, AppliedPriceRule, PriceResult, Currency } from "./pricing.types"

export function calculatePrice(
	context: PricingContext,
	appliedRules: AppliedPriceRule[] = [],
	currency: Currency
): PriceResult {
	const base = context.basePrice
	let current = base
	const breakdown = []

	breakdown.push({
		label: "Precio base",
		amount: base,
	})

	for (const appliedRule of appliedRules) {
		const { type, value } = appliedRule.rule

		switch (type) {
			case "fixed": {
				const diff = value - current
				current = value
				breakdown.push({
					label: "Precio fijo",
					amount: diff,
				})
				break
			}

			case "modifier": {
				current += value
				breakdown.push({
					label: "Ajuste",
					amount: value,
				})
				break
			}

			case "percentage": {
				const delta = (current * value) / 100
				current += delta
				breakdown.push({
					label: `Ajuste ${value}%`,
					amount: delta,
				})
				break
			}
		}
	}

	const total = roundMoney(Math.max(0, current))

	return {
		currency,
		base,
		adjustments: roundMoney(total - base),
		total,
		breakdown,
		appliedRules,
	}
}
