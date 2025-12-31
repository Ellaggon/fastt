export type BookingCurrency = "USD" | "BOB"

export interface CreateBookingInput {
	productId: string
	variantId: string
	ratePlanId: string
	checkIn: string
	checkOut: string
	adults: number
	children: number
	currency: BookingCurrency
	quotedTotal: number
}

export interface BookingResult {
	id: string
	status: "locked"
	total: number
	currency: BookingCurrency
}
