import type { APIRoute } from "astro"
import { searchOffers } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const raw = await searchOffers({
		productId: body.productId,
		checkIn: new Date(body.checkIn),
		checkOut: new Date(body.checkOut),
		adults: body.adults,
		children: body.children,
		rooms: body.rooms,
	})

	return new Response(JSON.stringify({ offers: raw }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
