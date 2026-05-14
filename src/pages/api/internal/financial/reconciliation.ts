import type { APIRoute } from "astro"
import { Booking, BookingRoomDetail, db, eq } from "astro:db"

import { financialRepository } from "@/container/financial.container"

import { bookingBelongsToProvider, json, requireFinancialProvider } from "./_stage2"

type ReconciliationStatus = "ok" | "mismatch" | "missing"

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const auth = await requireFinancialProvider(request)
		if (!auth.ok) return auth.response
		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			return json({ error: "validation_error", details: "bookingId is required" }, 400)
		}
		if (!(await bookingBelongsToProvider(bookingId, auth.providerId)))
			return json({ error: "not_found" }, 404)

		const bookingRow = await db
			.select({
				id: Booking.id,
				currency: Booking.currency,
				totalAmountUSD: Booking.totalAmountUSD,
				totalAmountBOB: Booking.totalAmountBOB,
			})
			.from(Booking)
			.where(eq(Booking.id, bookingId))
			.get()
		if (!bookingRow) {
			return json({ error: "not_found" }, 404)
		}

		const detailRow = await db
			.select({
				totalPrice: BookingRoomDetail.totalPrice,
			})
			.from(BookingRoomDetail)
			.where(eq(BookingRoomDetail.bookingId, bookingId))
			.get()

		const currency = String(bookingRow.currency ?? "USD").trim() || "USD"
		const fallbackTotal =
			currency === "BOB"
				? Number(bookingRow.totalAmountBOB ?? 0)
				: Number(bookingRow.totalAmountUSD ?? 0)
		const finalTotal = Number(detailRow?.totalPrice ?? fallbackTotal)

		const financial = await financialRepository.findByBookingId(bookingId)
		const matchedPaymentIntent = financial.paymentIntents.some(
			(intent) => intent.currency === currency && Number(intent.amount) === finalTotal
		)

		let status: ReconciliationStatus = "ok"
		if (financial.paymentIntents.length === 0) {
			status = "missing"
		} else if (!matchedPaymentIntent) {
			status = "mismatch"
		}

		return json({
			booking: {
				bookingId,
				finalTotal,
				currency,
			},
			financial: {
				paymentIntents: financial.paymentIntents,
				settlementRecords: financial.settlementRecords,
			},
			reconciliation: {
				status,
			},
		})
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "internal_error" }, 500)
	}
}
