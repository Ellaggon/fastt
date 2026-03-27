import type { APIRoute } from "astro"
import { searchOffers } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const { productId, checkIn, checkOut, adults, children = 0, currency = "USD" } = body

	const raw = await searchOffers({
		productId,
		checkIn: new Date(checkIn),
		checkOut: new Date(checkOut),
		adults,
		children,
		rooms: body.rooms,
	})

	const response = {
		currency,
		checkIn,
		checkOut,
		nights: (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
		// Legacy endpoint: keep the contract stable but align payload to the new SearchPipeline output.
		// IMPORTANT: do NOT call the old normalizeSearchResults (it expects the pre-refactor SQL DTO).
		offers: raw,
	}

	return new Response(JSON.stringify(response), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
