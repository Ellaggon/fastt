import type { APIRoute } from "astro"

import { Booking, BookingLineItem, db, eq, first } from "@/shared/infrastructure/db/compat"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { assertProviderCapability } from "@/lib/provider-governance"
import { buildChannelTaxFeePayload } from "@/modules/taxes-fees/public"
import { isPriceQuote } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ params, request }) => {
	const bookingId = String(params.bookingId ?? "").trim()
	const channel = new URL(request.url).searchParams.get("channel")?.trim() || "web"
	const user = await getUserFromRequest(request)
	if (!bookingId || !user)
		return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
	const booking = await db
		.select({ providerId: Booking.providerId })
		.from(Booking)
		.where(eq(Booking.id, bookingId))
		.then(first)
	if (!booking?.providerId)
		return new Response(JSON.stringify({ error: "not_found" }), { status: 404 })
	try {
		await assertProviderCapability({
			providerId: String(booking.providerId),
			currentUserId: user.id,
			capability: "booking",
		})
	} catch {
		return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
	}
	const line = await db
		.select({ pricingBreakdownJson: BookingLineItem.pricingBreakdownJson })
		.from(BookingLineItem)
		.where(eq(BookingLineItem.bookingId, bookingId))
		.then(first)
	const quote = (line?.pricingBreakdownJson as any)?.priceQuote
	if (!isPriceQuote(quote)) {
		return new Response(JSON.stringify({ error: "PRICE_QUOTE_CHANNEL_PAYLOAD_UNAVAILABLE" }), {
			status: 409,
		})
	}
	return new Response(JSON.stringify(buildChannelTaxFeePayload({ quote, channel })), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
