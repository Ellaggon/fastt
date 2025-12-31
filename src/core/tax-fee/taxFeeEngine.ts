import type { AppliedTaxFee } from "./taxFeeTypes"

interface TaxFeeInput {
	baseAmount: number
	nights: number
	guests: number
	currency: string
}

export function applyTaxFee(taxFee: any, input: TaxFeeInput): AppliedTaxFee {
	let amount = 0

	switch (taxFee.type) {
		case "percentage":
			amount = (input.baseAmount * taxFee.value) / 100
			break

		case "fixed":
			amount = taxFee.value
			break

		case "perNight":
			amount = taxFee.value * input.nights
			break

		case "perPerson":
			amount = taxFee.value * input.guests
			break

		case "perBooking":
			amount = taxFee.value
			break
	}

	return {
		id: taxFee.id,
		name: taxFee.name,
		type: taxFee.type,
		amount,
		currency: taxFee.currency,
		included: taxFee.isIncluded,
	}
}
