import {
	and,
	Booking,
	BookingLineItem,
	BookingVoucher,
	db,
	eq,
	first,
	Product,
	ProductReview,
	Variant,
} from "@/shared/infrastructure/db/compat"
import type {
	GuestTripBundle,
	GuestTripQueryRepositoryPort,
} from "../../application/ports/GuestTripQueryRepositoryPort"

export class GuestTripQueryRepository implements GuestTripQueryRepositoryPort {
	async loadOwnedTripBundle(params: {
		bookingId: string
		userId: string
	}): Promise<GuestTripBundle | null> {
		const booking = await db
			.select({
				id: Booking.id,
				userId: Booking.userId,
				status: Booking.status,
				operationalStatus: Booking.operationalStatus,
				checkedInAt: Booking.checkedInAt,
				checkInDate: Booking.checkInDate,
				numAdults: Booking.numAdults,
				numChildren: Booking.numChildren,
				totalAmount: Booking.totalAmount,
				currency: Booking.currency,
				guestEmailSnapshot: Booking.guestEmailSnapshot,
				guestContactSnapshotJson: Booking.guestContactSnapshotJson,
			})
			.from(Booking)
			.where(and(eq(Booking.id, params.bookingId), eq(Booking.userId, params.userId)))
			.then(first)

		if (!booking) return null

		const line = await db
			.select({
				variantNameSnapshot: BookingLineItem.variantNameSnapshot,
				productNameSnapshot: BookingLineItem.productNameSnapshot,
				productIdSnapshot: BookingLineItem.productIdSnapshot,
				adults: BookingLineItem.adults,
				children: BookingLineItem.children,
				totalAmount: BookingLineItem.totalAmount,
				pricingBreakdownJson: BookingLineItem.pricingBreakdownJson,
				occupancySnapshotJson: BookingLineItem.occupancySnapshotJson,
				productId: Product.id,
				destinationId: Product.destinationId,
				productType: Product.productType,
			})
			.from(BookingLineItem)
			.leftJoin(Variant, eq(Variant.id, BookingLineItem.variantId))
			.leftJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(BookingLineItem.bookingId, params.bookingId))
			.then(first)

		const voucher = await db
			.select({
				code: BookingVoucher.code,
				status: BookingVoucher.status,
				instructionsJson: BookingVoucher.instructionsJson,
				qrPayload: BookingVoucher.qrPayload,
			})
			.from(BookingVoucher)
			.where(eq(BookingVoucher.bookingId, params.bookingId))
			.then(first)

		const existingReview = await db
			.select({ id: ProductReview.id, status: ProductReview.status })
			.from(ProductReview)
			.where(eq(ProductReview.bookingId, params.bookingId))
			.then(first)

		return {
			booking: {
				id: String(booking.id),
				userId: booking.userId == null ? null : String(booking.userId),
				status: booking.status == null ? null : String(booking.status),
				operationalStatus:
					booking.operationalStatus == null ? null : String(booking.operationalStatus),
				checkedInAt: booking.checkedInAt ?? null,
				checkInDate: booking.checkInDate == null ? null : String(booking.checkInDate),
				numAdults: booking.numAdults == null ? null : Number(booking.numAdults),
				numChildren: booking.numChildren == null ? null : Number(booking.numChildren),
				totalAmount: booking.totalAmount == null ? null : Number(booking.totalAmount),
				currency: booking.currency == null ? null : String(booking.currency),
				guestEmailSnapshot:
					booking.guestEmailSnapshot == null ? null : String(booking.guestEmailSnapshot),
				guestContactSnapshotJson: booking.guestContactSnapshotJson ?? null,
			},
			line: line
				? {
						variantNameSnapshot:
							line.variantNameSnapshot == null ? null : String(line.variantNameSnapshot),
						productNameSnapshot:
							line.productNameSnapshot == null ? null : String(line.productNameSnapshot),
						productIdSnapshot:
							line.productIdSnapshot == null ? null : String(line.productIdSnapshot),
						adults: line.adults == null ? null : Number(line.adults),
						children: line.children == null ? null : Number(line.children),
						totalAmount: line.totalAmount == null ? null : Number(line.totalAmount),
						pricingBreakdownJson: line.pricingBreakdownJson ?? null,
						occupancySnapshotJson: line.occupancySnapshotJson ?? null,
						productId: line.productId == null ? null : String(line.productId),
						destinationId: line.destinationId == null ? null : String(line.destinationId),
						productType: line.productType == null ? null : String(line.productType),
					}
				: null,
			voucher: voucher
				? {
						code: voucher.code == null ? null : String(voucher.code),
						status: voucher.status == null ? null : String(voucher.status),
						instructionsJson: voucher.instructionsJson ?? null,
						qrPayload: voucher.qrPayload == null ? null : String(voucher.qrPayload),
					}
				: null,
			existingReview: existingReview
				? {
						id: String(existingReview.id),
						status: existingReview.status == null ? null : String(existingReview.status),
					}
				: null,
		}
	}
}
