import type { APIRoute } from "astro"

import { Booking, BookingLineItem, db, eq, first } from "@/shared/infrastructure/db/compat"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { assertProviderCapability } from "@/lib/provider-governance"
import { buildBookingReceipt } from "@/modules/booking/public"
import { isPriceQuote } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ params, request }) => {
	const bookingId = String(params.bookingId ?? "").trim()
	if (!bookingId)
		return new Response(JSON.stringify({ error: "BOOKING_NOT_FOUND" }), { status: 404 })

	const user = await getUserFromRequest(request)
	if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })

	const booking = await db
		.select({
			id: Booking.id,
			userId: Booking.userId,
			providerId: Booking.providerId,
			status: Booking.status,
			confirmedAt: Booking.confirmedAt,
		})
		.from(Booking)
		.where(eq(Booking.id, bookingId))
		.then(first)
	if (!booking) return new Response(JSON.stringify({ error: "BOOKING_NOT_FOUND" }), { status: 404 })

	const isGuestOwner = String(booking.userId ?? "") === String(user.id)
	if (!isGuestOwner) {
		if (!booking.providerId)
			return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
		try {
			await assertProviderCapability({
				providerId: String(booking.providerId),
				currentUserId: user.id,
				capability: "booking",
			})
		} catch {
			return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
		}
	}

	const line = await db
		.select({ pricingBreakdownJson: BookingLineItem.pricingBreakdownJson })
		.from(BookingLineItem)
		.where(eq(BookingLineItem.bookingId, bookingId))
		.then(first)
	const quote = (line?.pricingBreakdownJson as any)?.priceQuote
	if (!isPriceQuote(quote)) {
		return new Response(JSON.stringify({ error: "PRICE_QUOTE_RECEIPT_UNAVAILABLE" }), {
			status: 409,
		})
	}

	return new Response(
		JSON.stringify(
			buildBookingReceipt({
				bookingId,
				status: String(booking.status ?? "confirmed"),
				issuedAt: booking.confirmedAt,
				quote,
			})
		),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
