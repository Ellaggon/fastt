import {
	and,
	Booking,
	BookingLineItem,
	BookingTaxFee,
	db,
	desc,
	eq,
	gte,
	inArray,
	lte,
	RefundLedger,
} from "@/shared/infrastructure/db/compat"
import { buildFiscalReport } from "@/modules/taxes-fees/public"

function dateStart(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function dateEnd(value: string) {
	return new Date(`${value}T23:59:59.999Z`)
}

export async function getProviderFiscalReport(input: {
	providerId: string
	from: string
	to: string
}) {
	const bookingRows = await db
		.select({
			bookingId: Booking.id,
			status: Booking.status,
			currency: Booking.currency,
			confirmedAt: Booking.confirmedAt,
			totalAmount: Booking.totalAmount,
			pricingBreakdownJson: BookingLineItem.pricingBreakdownJson,
		})
		.from(Booking)
		.leftJoin(BookingLineItem, eq(BookingLineItem.bookingId, Booking.id))
		.where(
			and(
				eq(Booking.providerId, input.providerId),
				gte(Booking.confirmedAt, dateStart(input.from)),
				lte(Booking.confirmedAt, dateEnd(input.to))
			)
		)
		.orderBy(desc(Booking.confirmedAt))
		.limit(2001)
	const truncated = bookingRows.length > 2000
	const bookings = bookingRows.slice(0, 2000)

	const byBooking = new Map<string, (typeof bookings)[number]>()
	for (const booking of bookings) {
		const id = String(booking.bookingId)
		if (!byBooking.has(id) || booking.pricingBreakdownJson) byBooking.set(id, booking)
	}
	const bookingIds = [...byBooking.keys()]
	const [taxSnapshots, refunds] = await Promise.all([
		bookingIds.length
			? db
					.select({ bookingId: BookingTaxFee.bookingId, totalAmount: BookingTaxFee.totalAmount })
					.from(BookingTaxFee)
					.where(inArray(BookingTaxFee.bookingId, bookingIds))
			: Promise.resolve([]),
		bookingIds.length
			? db
					.select({
						bookingId: RefundLedger.bookingId,
						refundAmount: RefundLedger.refundAmount,
						status: RefundLedger.status,
					})
					.from(RefundLedger)
					.where(
						and(
							eq(RefundLedger.providerId, input.providerId),
							inArray(RefundLedger.bookingId, bookingIds)
						)
					)
			: Promise.resolve([]),
	])

	return {
		...buildFiscalReport({
			bookings: [...byBooking.values()].map((row) => ({
				...row,
				bookingId: String(row.bookingId),
			})),
			taxSnapshots: taxSnapshots.map((row) => ({ ...row, bookingId: String(row.bookingId) })),
			refunds: refunds.map((row) => ({ ...row, bookingId: String(row.bookingId) })),
		}),
		truncated,
	}
}
