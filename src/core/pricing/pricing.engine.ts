import { roundMoney } from "./pricing.utils"
import type { PricingContext, AppliedRatePlan, PriceResult } from "./pricing.types"

export function calculatePrice(
	context: PricingContext,
	ratePlan: AppliedRatePlan,
	currency: "USD" | "BOB"
): PriceResult {
	const base = currency === "USD" ? context.basePriceUSD : context.basePriceBOB

	let adjustments = 0
	const breakdown = []

	breakdown.push({
		label: "Precio base",
		amount: base,
	})

	// --- RATE PLAN LOGIC ---
	switch (ratePlan.type) {
		case "package":
			breakdown.push({
				label: "Paquete (precio incluido)",
				amount: 0,
			})
			return {
				currency,
				base,
				adjustments: 0,
				total: base,
				breakdown,
			}

		case "fixed": {
			const value = currency === "USD" ? ratePlan.valueUSD : ratePlan.valueBOB

			adjustments += value

			breakdown.push({
				label: `Ajuste fijo`,
				amount: value,
			})
			break
		}

		case "percentage": {
			const percent = currency === "USD" ? ratePlan.valueUSD : ratePlan.valueBOB

			const value = -(base * percent) / 100
			adjustments += value

			breakdown.push({
				label: `Descuento ${percent}%`,
				amount: value,
			})
			break
		}

		case "modifier": {
			const value = currency === "USD" ? ratePlan.valueUSD : ratePlan.valueBOB

			adjustments += value

			breakdown.push({
				label: "Modificador",
				amount: value,
			})
			break
		}
	}

	const total = roundMoney(base + adjustments)

	return {
		currency,
		base,
		adjustments: roundMoney(adjustments),
		total,
		breakdown,
	}
}
