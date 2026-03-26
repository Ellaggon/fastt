import { roundMoney } from "./pricing.utils"

export type MinimalPriceRule = { id: string; type: "fixed" | "percentage"; value: number }

/**
 * CAPA 4B minimal pricing computation.
 *
 * Intentionally supports ONLY:
 * - fixed: sets the absolute current price
 * - percentage: applies a percentage adjustment over the current price
 *
 * NOTE: This function contains no promotions, yield multipliers, or hidden defaults.
 */
export function computeBasePriceWithRules(basePrice: number, rules: MinimalPriceRule[]): number {
	let current = basePrice

	for (const r of rules) {
		if (r.type === "fixed") {
			current = r.value
			continue
		}

		// percentage
		current += (current * r.value) / 100
	}

	return roundMoney(Math.max(0, current))
}
