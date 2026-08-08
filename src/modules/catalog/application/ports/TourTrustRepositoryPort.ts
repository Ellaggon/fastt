export type TourTrustBookingRow = {
	id: string
	userId: string | null
	status: string | null
	operationalStatus: string | null
	checkedInAt: Date | string | null
	providerId: string | null
}

export type TourTrustLineRow = {
	productId: string | null
	productType: string | null
	productIdSnapshot: string | null
}

export type TourPrivateSlotRow = {
	variantId: string
	isActive: boolean | null
	productId: string
	providerId: string | null
	bookingMode: string | null
}

export type TourPrivateRequestRow = {
	id: string
	providerId: string
	status: string | null
	slaDueAt?: Date | string | null
}

export type InsertProductReviewParams = {
	id: string
	productId: string
	userId: string
	bookingId: string
	rating: number
	body: string | null
	status: string
}

export type InsertMarketplaceEventParams = {
	id: string
	eventType: string
	surface: string
	sourceProductId: string | null
	targetProductId: string | null
	destinationId: string | null
	bookingId: string | null
	sessionId: string | null
	metaJson: Record<string, unknown> | null
}

export type InsertPrivateRequestParams = {
	id: string
	productId: string
	variantId: string
	providerId: string
	userId: string | null
	departureDate: string
	partyJson: {
		adults: number
		children: number
		infants: number
		rooms: number
	}
	contactName: string
	contactEmail: string
	contactPhone: string | null
	message: string | null
	status: string
	slaDueAt: Date
}

export interface TourTrustRepositoryPort {
	findOwnedBooking(params: {
		bookingId: string
		userId: string
	}): Promise<TourTrustBookingRow | null>

	findVoucherStatus(bookingId: string): Promise<string | null>

	findTourLineForBooking(bookingId: string): Promise<TourTrustLineRow | null>

	findReviewByBookingId(bookingId: string): Promise<{ id: string; status: string | null } | null>

	insertProductReview(params: InsertProductReviewParams): Promise<void>

	findReviewWithProductProvider(reviewId: string): Promise<{
		id: string
		status: string | null
		providerId: string | null
	} | null>

	updateReviewStatus(params: { reviewId: string; status: string }): Promise<void>

	findProductById(productId: string): Promise<{ id: string; productType: string | null } | null>

	findAttributedMarketplaceEvent(params: {
		bookingId: string
		targetProductId: string
	}): Promise<{ id: string } | null>

	insertMarketplaceEvent(params: InsertMarketplaceEventParams): Promise<void>

	findPrivateTourSlot(params: {
		productId: string
		variantId: string
	}): Promise<TourPrivateSlotRow | null>

	findPendingPrivateRequest(params: {
		variantId: string
		departureDate: string
		contactEmail: string
	}): Promise<{ id: string; slaDueAt: Date | string | null } | null>

	insertPrivateRequest(params: InsertPrivateRequestParams): Promise<void>

	findPrivateRequestForProvider(params: {
		requestId: string
		providerId: string
	}): Promise<TourPrivateRequestRow | null>

	updatePrivateRequestTransition(params: {
		requestId: string
		providerId: string
		status: string
		providerNote: string | null
	}): Promise<void>
}
