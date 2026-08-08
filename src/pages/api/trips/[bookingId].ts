import type { APIRoute } from "astro"

import { guestTripQueryRepository } from "@/container/booking.container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getGuestTripConfirmation } from "@/modules/booking/public"

export const GET: APIRoute = async ({ request, params }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const bookingId = String(params.bookingId ?? "").trim()
	if (!bookingId) {
		return new Response(JSON.stringify({ error: "validation_error" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const trip = await getGuestTripConfirmation(
		{ repo: guestTripQueryRepository },
		{ bookingId, userId: user.id }
	)
	if (!trip) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	return new Response(JSON.stringify(trip), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
