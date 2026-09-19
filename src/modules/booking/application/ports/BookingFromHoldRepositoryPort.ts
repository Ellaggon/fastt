export type CreateBookingFromHoldInput = {
	holdId: string
	priceQuoteId?: string | null
	userId?: string | null
	source?: string | null
	leadName?: string | null
	tourAnswers?: Array<{ questionId: string; value: string }> | null
}

export type CreateBookingFromHoldResult = {
	bookingId: string
	status: string
	idempotent: boolean
	variantId: string
	productId: string
	availabilityRange: {
		from: string
		to: string
	}
}

export type BookingFromHoldRepositoryPort = {
	createBookingFromHold(input: CreateBookingFromHoldInput): Promise<CreateBookingFromHoldResult>
}
