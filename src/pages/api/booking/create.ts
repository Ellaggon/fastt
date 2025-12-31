import type { APIRoute } from "astro"
import { createBooking } from "@/core/booking/booking.service"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		const booking = await createBooking(body)

		return new Response(JSON.stringify(booking), { status: 201 })
	} catch (err: any) {
		return new Response(JSON.stringify({ error: err.message }), { status: err.status ?? 500 })
	}
}
