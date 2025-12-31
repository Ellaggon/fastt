export type TaxFeeType = "percentage" | "fixed" | "perNight" | "perPerson" | "perBooking"

export interface AppliedTaxFee {
	id: string
	name: string
	type: TaxFeeType
	amount: number
	currency: string
	included: boolean
}
