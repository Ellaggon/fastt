import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { and, Booking, BookingVoucher, db, eq, first } from "@/shared/infrastructure/db/compat"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"

const schema = z.object({
	bookingId: z.string().uuid(),
})

/**
 * Day-of ops: mark tour participants presented (reuses Booking.checkedInAt).
 * Optionally redeems the BookingVoucher when present.
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse(body)

		const booking = await db
			.select({
				id: Booking.id,
				providerId: Booking.providerId,
				checkedInAt: Booking.checkedInAt,
				status: Booking.status,
			})
			.from(Booking)
			.where(and(eq(Booking.id, parsed.bookingId), eq(Booking.providerId, providerId)))
			.then(first)

		if (!booking) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}
		if (String(booking.status) !== "confirmed") {
			return new Response(JSON.stringify({ error: "booking_not_confirmed" }), { status: 400 })
		}

		const now = new Date()
		if (!booking.checkedInAt) {
			await db
				.update(Booking)
				.set({
					checkedInAt: now,
					checkedInBy: user.id ?? null,
					operationalStatus: "in_house",
				} as any)
				.where(eq(Booking.id, parsed.bookingId))
		}

		const voucher = await db
			.select()
			.from(BookingVoucher)
			.where(eq(BookingVoucher.bookingId, parsed.bookingId))
			.then(first)

		if (voucher && String(voucher.status) === "issued") {
			await db
				.update(BookingVoucher)
				.set({ status: "redeemed", redeemedAt: now, updatedAt: now } as any)
				.where(eq(BookingVoucher.id, voucher.id))
		}

		return new Response(
			JSON.stringify({
				ok: true,
				bookingId: parsed.bookingId,
				checkedInAt:
					(booking.checkedInAt ?? now).toISOString?.() ?? String(booking.checkedInAt ?? now),
				voucherStatus: voucher
					? String(voucher.status) === "issued"
						? "redeemed"
						: voucher.status
					: null,
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		console.error("booking check-in", e)
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}
