import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import {
	and,
	Booking,
	BookingVoucher,
	db,
	eq,
	first,
	Product,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import {
	recordTourCheckIn,
	recordTourVoucher,
	toursCheckinEnabled,
} from "@/lib/tours/tourObservability"
import { deriveBookingLifecycle } from "@/modules/booking/public"

const schema = z.object({
	bookingId: z.string().uuid(),
})

/**
 * Day-of ops: mark tour participants presented (reuses Booking.checkedInAt).
 * Canonical operationalStatus is `checked_in` (not legacy `in_house`).
 * Only `productType=Tour` bookings may be mutated.
 * Idempotent on Booking.checkedInAt; convergent on voucher — a retry with
 * Booking already checked_in still redeems an issued voucher left by a
 * partial prior failure.
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			recordTourCheckIn("unauthorized")
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			// Guests (and any non-provider session) cannot check in.
			recordTourCheckIn("unauthorized")
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}
		const checkInHost = (() => {
			try {
				return new URL(request.url).host
			} catch {
				return null
			}
		})()
		const tourMetricCtx = {
			providerId,
			subject: { providerId, host: checkInHost },
		}
		// Env-only kill-switch + canary (staging → allowlist → % → general).
		if (
			!toursCheckinEnabled({
				providerId,
				host: checkInHost,
			})
		) {
			recordTourCheckIn("disabled", "canary_or_kill_switch", tourMetricCtx)
			return new Response(
				JSON.stringify({
					error: "tours_checkin_disabled",
					message: "Tour check-in is temporarily disabled.",
				}),
				{ status: 503, headers: { "Content-Type": "application/json" } }
			)
		}

		const body = await request.json().catch(() => ({}))
		const parsed = schema.parse(body)

		const booking = await db
			.select({
				id: Booking.id,
				providerId: Booking.providerId,
				checkedInAt: Booking.checkedInAt,
				checkedInBy: Booking.checkedInBy,
				status: Booking.status,
				operationalStatus: Booking.operationalStatus,
				checkInDate: Booking.checkInDate,
				checkOutDate: Booking.checkOutDate,
				productType: Product.productType,
			})
			.from(Booking)
			.innerJoin(RatePlan, eq(RatePlan.id, Booking.ratePlanId))
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Booking.id, parsed.bookingId), eq(Booking.providerId, providerId)))
			.then(first)

		if (!booking) {
			recordTourCheckIn("not_found", undefined, tourMetricCtx)
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}
		if (!isTourProductType(booking.productType)) {
			// Same-provider hotel/package bookings must not be mutated by this endpoint.
			recordTourCheckIn("not_tour", undefined, tourMetricCtx)
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}
		if (String(booking.status) !== "confirmed") {
			return new Response(JSON.stringify({ error: "booking_not_confirmed" }), { status: 400 })
		}

		const alreadyCheckedIn = Boolean(booking.checkedInAt)
		const now = new Date()
		const checkedInAt = booking.checkedInAt ?? now
		const checkedInBy = booking.checkedInBy ?? user.id ?? null

		if (!alreadyCheckedIn) {
			await db
				.update(Booking)
				.set({
					checkedInAt,
					checkedInBy,
					operationalStatus: "checked_in",
				} as any)
				.where(eq(Booking.id, parsed.bookingId))
		}

		const voucher = await db
			.select()
			.from(BookingVoucher)
			.where(eq(BookingVoucher.bookingId, parsed.bookingId))
			.then(first)

		let voucherStatus = voucher ? String(voucher.status) : null
		let voucherRepaired = false
		if (voucher && String(voucher.status) === "issued") {
			await db
				.update(BookingVoucher)
				.set({ status: "redeemed", redeemedAt: now, updatedAt: now } as any)
				.where(eq(BookingVoucher.id, voucher.id))
			voucherStatus = "redeemed"
			voucherRepaired = alreadyCheckedIn
			recordTourVoucher("redeemed", "success", tourMetricCtx)
		}

		const lifecycle = deriveBookingLifecycle({
			status: String(booking.status),
			operationalStatus: alreadyCheckedIn
				? String(booking.operationalStatus ?? "checked_in")
				: "checked_in",
			checkIn: booking.checkInDate == null ? null : String(booking.checkInDate),
			checkOut: booking.checkOutDate == null ? null : String(booking.checkOutDate),
			productType: "Tour",
		})

		const outcome = !alreadyCheckedIn ? "success" : voucherRepaired ? "recovered" : "idempotent"
		recordTourCheckIn(
			outcome,
			voucherRepaired ? "voucher_redeem_repaired" : undefined,
			tourMetricCtx
		)

		return new Response(
			JSON.stringify({
				ok: true,
				bookingId: parsed.bookingId,
				idempotent: alreadyCheckedIn && !voucherRepaired,
				repaired: voucherRepaired,
				checkedInAt: checkedInAt.toISOString?.() ?? String(checkedInAt),
				checkedInBy,
				operationalStatus: "checked_in",
				lifecycleState: lifecycle.state,
				lifecycleLabel: lifecycle.label,
				voucherStatus,
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
