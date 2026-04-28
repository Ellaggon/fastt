import type { APIRoute } from "astro"
import { Booking, BookingRoomDetail, db, eq } from "astro:db"

import { financialRepository } from "@/container/financial.container"
import { incrementCounter } from "@/lib/observability/metrics"
import { logger } from "@/lib/observability/logger"

type ReconciliationStatus = "ok" | "mismatch" | "missing"

export const GET: APIRoute = async ({ url }) => {
	try {
		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: "bookingId is required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

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
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
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
			incrementCounter("financial.reconciliation.missing", {}, 1)
		} else if (!matchedPaymentIntent) {
			status = "mismatch"
			incrementCounter("financial.reconciliation.mismatch", {}, 1)
		}
		incrementCounter("financial.reconciliation.observed", {}, 1)
		logger.info("financial.reconciliation.status", {
			bookingId,
			status,
		})

		return new Response(
			JSON.stringify({
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
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
