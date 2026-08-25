export type GuestTripBookingRow = {
	id: string
	userId: string | null
	status: string | null
	operationalStatus: string | null
	checkedInAt: Date | string | null
	checkInDate: string | null
	numAdults: number | null
	numChildren: number | null
	totalAmount: number | null
	currency: string | null
	guestEmailSnapshot: string | null
	guestContactSnapshotJson: unknown
}

export type GuestTripLineRow = {
	variantNameSnapshot: string | null
	productNameSnapshot: string | null
	productIdSnapshot: string | null
	adults: number | null
	children: number | null
	totalAmount: number | null
	pricingBreakdownJson: unknown
	occupancySnapshotJson: unknown
	productId: string | null
	geoPlaceId: string | null
	productType: string | null
}

export type GuestTripVoucherRow = {
	code: string | null
	status: string | null
	instructionsJson: unknown
	qrPayload: string | null
}

export type GuestTripReviewRow = {
	id: string
	status: string | null
}

export type GuestTripBundle = {
	booking: GuestTripBookingRow
	line: GuestTripLineRow | null
	voucher: GuestTripVoucherRow | null
	existingReview: GuestTripReviewRow | null
}

export interface GuestTripQueryRepositoryPort {
	loadOwnedTripBundle(params: {
		bookingId: string
		userId: string
	}): Promise<GuestTripBundle | null>
}
