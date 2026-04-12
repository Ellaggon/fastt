import type { APIRoute } from "astro"
import { and, Booking, BookingRoomDetail, BookingTaxFee, db, eq } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "booking-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const booking = await db
			.select({
				id: Booking.id,
				userId: Booking.userId,
				status: Booking.status,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				currency: Booking.currency,
				totalAmountUSD: Booking.totalAmountUSD,
				totalAmountBOB: Booking.totalAmountBOB,
				numAdults: Booking.numAdults,
				numChildren: Booking.numChildren,
				confirmedAt: Booking.confirmedAt,
			})
			.from(Booking)
			.where(eq(Booking.id, bookingId))
			.get()

		if (!booking) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const userId = String((user as any).id ?? "").trim()
		if (booking.userId && userId && String(booking.userId) !== userId) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const detail = await db
			.select({
				variantId: BookingRoomDetail.variantId,
				checkIn: BookingRoomDetail.checkIn,
				checkOut: BookingRoomDetail.checkOut,
				adults: BookingRoomDetail.adults,
				children: BookingRoomDetail.children,
				basePrice: BookingRoomDetail.basePrice,
				taxes: BookingRoomDetail.taxes,
				totalPrice: BookingRoomDetail.totalPrice,
			})
			.from(BookingRoomDetail)
			.where(eq(BookingRoomDetail.bookingId, bookingId))
			.get()

		const taxLines = await db
			.select({
				id: BookingTaxFee.id,
				name: BookingTaxFee.name,
				totalAmount: BookingTaxFee.totalAmount,
				breakdownJson: BookingTaxFee.breakdownJson,
			})
			.from(BookingTaxFee)
			.where(eq(BookingTaxFee.bookingId, bookingId))
			.all()

		const total =
			booking.currency === "BOB"
				? Number(booking.totalAmountBOB ?? detail?.totalPrice ?? 0)
				: Number(booking.totalAmountUSD ?? detail?.totalPrice ?? 0)

		logEndpoint()
		return new Response(
			JSON.stringify({
				booking: {
					id: booking.id,
					status: booking.status ?? "confirmed",
					checkIn: detail?.checkIn ?? booking.checkInDate,
					checkOut: detail?.checkOut ?? booking.checkOutDate,
					adults: detail?.adults ?? booking.numAdults ?? 0,
					children: detail?.children ?? booking.numChildren ?? 0,
					currency: booking.currency ?? "USD",
					total,
					confirmedAt: booking.confirmedAt,
					createdAt: booking.bookingDate,
					variantId: detail?.variantId ?? null,
					basePrice: detail?.basePrice ?? null,
					taxes: detail?.taxes ?? null,
				},
				taxes: taxLines.map((line) => ({
					id: line.id,
					name: line.name ?? "Impuestos y cargos",
					totalAmount: Number(line.totalAmount ?? 0),
					breakdown: line.breakdownJson ?? null,
				})),
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		logEndpoint()
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
