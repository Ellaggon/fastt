import type { APIRoute } from "astro"
import { searchOffers } from "@/container"
import { normalizeSearchResults } from "@/modules/search/public"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const raw = await searchOffers({
		productId: body.productId,
		checkIn: new Date(body.checkIn),
		checkOut: new Date(body.checkOut),
		adults: body.adults,
		children: body.children,
	})

	return new Response(JSON.stringify(normalizeSearchResults(raw)))
}
