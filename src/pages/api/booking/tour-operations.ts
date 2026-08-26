import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { isTourProductType } from "@/lib/catalog/productVerticalRegistry"
import {
	Booking,
	db,
	eq,
	first,
	Product,
	RatePlan,
	Variant,
	and,
} from "@/shared/infrastructure/db/compat"

const schema = z.object({
	bookingId: z.string().uuid(),
	action: z.enum(["no_show", "note"]),
	note: z.string().trim().max(2_000).optional(),
})

/** Provider-only day-of actions for a Tour participant. */
export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		const providerId = user ? await getProviderIdFromRequest(request, user) : null
		if (!user?.id || !providerId) {
			return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
		}

		const input = schema.parse(await request.json())
		const booking = await db
			.select({
				id: Booking.id,
				status: Booking.status,
				checkedInAt: Booking.checkedInAt,
				notes: Booking.notes,
				productType: Product.productType,
			})
			.from(Booking)
			.innerJoin(RatePlan, eq(RatePlan.id, Booking.ratePlanId))
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(Booking.id, input.bookingId), eq(Booking.providerId, providerId)))
			.then(first)
		if (!booking || !isTourProductType(booking.productType)) {
			return new Response(JSON.stringify({ error: "not_found" }), { status: 404 })
		}

		if (input.action === "no_show") {
			if (String(booking.status).toLowerCase() !== "confirmed" || booking.checkedInAt) {
				return new Response(JSON.stringify({ error: "booking_not_eligible_for_no_show" }), {
					status: 409,
				})
			}
			await db
				.update(Booking)
				.set({
					operationalStatus: "no_show",
					noShowAt: new Date(),
					noShowBy: user.id,
				} as any)
				.where(eq(Booking.id, booking.id))
			return new Response(JSON.stringify({ ok: true, operationalStatus: "no_show" }))
		}

		const note = String(input.note ?? "").trim()
		if (!note) {
			return new Response(JSON.stringify({ error: "note_required" }), { status: 400 })
		}
		const stampedNote = `[${new Date().toISOString()}] ${note}`
		const notes = [String(booking.notes ?? "").trim(), stampedNote].filter(Boolean).join("\n")
		await db
			.update(Booking)
			.set({ notes } as any)
			.where(eq(Booking.id, booking.id))
		return new Response(JSON.stringify({ ok: true, notes }))
	} catch (error) {
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
			})
		}
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}
