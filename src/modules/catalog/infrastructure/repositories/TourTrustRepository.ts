import {
	and,
	Booking,
	BookingLineItem,
	BookingVoucher,
	db,
	eq,
	first,
	MarketplaceEvent,
	Product,
	ProductReview,
	ProductStatus,
	TourPrivateRequest,
	TourSlotProfile,
	Variant,
} from "@/shared/infrastructure/db/compat"
import type {
	InsertMarketplaceEventParams,
	InsertPrivateRequestParams,
	InsertProductReviewParams,
	TourTrustRepositoryPort,
} from "../../application/ports/TourTrustRepositoryPort"

export class TourTrustRepository implements TourTrustRepositoryPort {
	async findOwnedBooking(params: { bookingId: string; userId: string }) {
		const row = await db
			.select({
				id: Booking.id,
				userId: Booking.userId,
				status: Booking.status,
				operationalStatus: Booking.operationalStatus,
				checkedInAt: Booking.checkedInAt,
				providerId: Booking.providerId,
			})
			.from(Booking)
			.where(and(eq(Booking.id, params.bookingId), eq(Booking.userId, params.userId)))
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			userId: row.userId == null ? null : String(row.userId),
			status: row.status == null ? null : String(row.status),
			operationalStatus: row.operationalStatus == null ? null : String(row.operationalStatus),
			checkedInAt: row.checkedInAt ?? null,
			providerId: row.providerId == null ? null : String(row.providerId),
		}
	}

	async findVoucherStatus(bookingId: string) {
		const voucher = await db
			.select({ status: BookingVoucher.status })
			.from(BookingVoucher)
			.where(eq(BookingVoucher.bookingId, bookingId))
			.then(first)
		return voucher?.status == null ? null : String(voucher.status)
	}

	async findTourLineForBooking(bookingId: string) {
		const line = await db
			.select({
				productId: Product.id,
				productType: Product.productType,
				productIdSnapshot: BookingLineItem.productIdSnapshot,
			})
			.from(BookingLineItem)
			.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(BookingLineItem.bookingId, bookingId))
			.then(first)
		if (!line) return null
		return {
			productId: line.productId == null ? null : String(line.productId),
			productType: line.productType == null ? null : String(line.productType),
			productIdSnapshot: line.productIdSnapshot == null ? null : String(line.productIdSnapshot),
		}
	}

	async findReviewByBookingId(bookingId: string) {
		const row = await db
			.select({ id: ProductReview.id, status: ProductReview.status })
			.from(ProductReview)
			.where(eq(ProductReview.bookingId, bookingId))
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			status: row.status == null ? null : String(row.status),
		}
	}

	async insertProductReview(params: InsertProductReviewParams) {
		await db.insert(ProductReview).values({
			id: params.id,
			productId: params.productId,
			userId: params.userId,
			bookingId: params.bookingId,
			rating: params.rating,
			body: params.body,
			status: params.status,
		} as any)
	}

	async findReviewWithProductProvider(reviewId: string) {
		const row = await db
			.select({
				id: ProductReview.id,
				status: ProductReview.status,
				providerId: Product.providerId,
			})
			.from(ProductReview)
			.innerJoin(Product, eq(Product.id, ProductReview.productId))
			.where(eq(ProductReview.id, reviewId))
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			status: row.status == null ? null : String(row.status),
			providerId: row.providerId == null ? null : String(row.providerId),
		}
	}

	async updateReviewStatus(params: { reviewId: string; status: string }) {
		await db
			.update(ProductReview)
			.set({ status: params.status, updatedAt: new Date() } as any)
			.where(eq(ProductReview.id, params.reviewId))
	}

	async findProductById(productId: string) {
		const row = await db
			.select({ id: Product.id, productType: Product.productType })
			.from(Product)
			.where(eq(Product.id, productId))
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			productType: row.productType == null ? null : String(row.productType),
		}
	}

	async findAttributedMarketplaceEvent(params: { bookingId: string; targetProductId: string }) {
		const row = await db
			.select({ id: MarketplaceEvent.id })
			.from(MarketplaceEvent)
			.where(
				and(
					eq(MarketplaceEvent.eventType, "booking_attributed"),
					eq(MarketplaceEvent.bookingId, params.bookingId),
					eq(MarketplaceEvent.targetProductId, params.targetProductId)
				)
			)
			.then(first)
		if (!row) return null
		return { id: String(row.id) }
	}

	async insertMarketplaceEvent(params: InsertMarketplaceEventParams) {
		await db.insert(MarketplaceEvent).values({
			id: params.id,
			eventType: params.eventType,
			surface: params.surface,
			sourceProductId: params.sourceProductId,
			targetProductId: params.targetProductId,
			geoPlaceId: params.geoPlaceId,
			bookingId: params.bookingId,
			sessionId: params.sessionId,
			metaJson: params.metaJson,
		} as any)
	}

	async findPrivateTourSlot(params: { productId: string; variantId: string }) {
		const row = await db
			.select({
				variantId: Variant.id,
				isActive: Variant.isActive,
				productId: Product.id,
				providerId: Product.providerId,
				bookingMode: TourSlotProfile.bookingMode,
			})
			.from(Variant)
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.innerJoin(ProductStatus, eq(ProductStatus.productId, Product.id))
			.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, Variant.id))
			.where(
				and(
					eq(Variant.id, params.variantId),
					eq(Variant.productId, params.productId),
					eq(Variant.kind, "tour_slot"),
					eq(Product.dataClass, "production"),
					eq(ProductStatus.state, "published")
				)
			)
			.then(first)
		if (!row) return null
		return {
			variantId: String(row.variantId),
			isActive: row.isActive ?? null,
			productId: String(row.productId),
			providerId: row.providerId == null ? null : String(row.providerId),
			bookingMode: row.bookingMode == null ? null : String(row.bookingMode),
		}
	}

	async findPendingPrivateRequest(params: {
		variantId: string
		departureDate: string
		contactEmail: string
	}) {
		const row = await db
			.select({
				id: TourPrivateRequest.id,
				slaDueAt: TourPrivateRequest.slaDueAt,
			})
			.from(TourPrivateRequest)
			.where(
				and(
					eq(TourPrivateRequest.variantId, params.variantId),
					eq(TourPrivateRequest.departureDate, params.departureDate),
					eq(TourPrivateRequest.contactEmail, params.contactEmail),
					eq(TourPrivateRequest.status, "pending")
				)
			)
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			slaDueAt: row.slaDueAt ?? null,
		}
	}

	async insertPrivateRequest(params: InsertPrivateRequestParams) {
		await db.insert(TourPrivateRequest).values({
			id: params.id,
			productId: params.productId,
			variantId: params.variantId,
			providerId: params.providerId,
			userId: params.userId,
			departureDate: params.departureDate,
			partyJson: params.partyJson,
			contactName: params.contactName,
			contactEmail: params.contactEmail,
			contactPhone: params.contactPhone,
			message: params.message,
			status: params.status,
			slaDueAt: params.slaDueAt,
		} as any)
	}

	async findPrivateRequestForProvider(params: { requestId: string; providerId: string }) {
		const row = await db
			.select({
				id: TourPrivateRequest.id,
				providerId: TourPrivateRequest.providerId,
				status: TourPrivateRequest.status,
			})
			.from(TourPrivateRequest)
			.where(
				and(
					eq(TourPrivateRequest.id, params.requestId),
					eq(TourPrivateRequest.providerId, params.providerId)
				)
			)
			.then(first)
		if (!row) return null
		return {
			id: String(row.id),
			providerId: String(row.providerId),
			status: row.status == null ? null : String(row.status),
		}
	}

	async updatePrivateRequestTransition(params: {
		requestId: string
		providerId: string
		status: string
		providerNote: string | null
	}) {
		await db
			.update(TourPrivateRequest)
			.set({
				status: params.status,
				providerNote: params.providerNote,
				updatedAt: new Date(),
			} as any)
			.where(
				and(
					eq(TourPrivateRequest.id, params.requestId),
					eq(TourPrivateRequest.providerId, params.providerId)
				)
			)
	}
}
