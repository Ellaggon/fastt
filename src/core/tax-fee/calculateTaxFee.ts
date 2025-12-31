import { applyTaxFee } from "./taxFeeEngine"

export function calculateTaxesAndFees({
	pricingResult,
	taxFees,
}: {
	pricingResult: {
		baseAmount: number
		nights: number
		guests: number
		currency: "USD" | "BOB"
	}
	taxFees: any[]
}) {
	const applied = taxFees
		.filter((tf) => tf.isActive)
		.map((tf) =>
			applyTaxFee(tf, {
				baseAmount: pricingResult.baseAmount,
				nights: pricingResult.nights,
				guests: pricingResult.guests,
				currency: pricingResult.currency,
			})
		)

	const excluded = applied.filter((t) => !t.included)

	const totalExcluded = excluded.reduce((sum, t) => sum + t.amount, 0)

	return {
		subtotal: pricingResult.baseAmount,
		taxes: applied, // ← snapshot listo para BookingTaxFee
		total: pricingResult.baseAmount + totalExcluded,
	}
}
