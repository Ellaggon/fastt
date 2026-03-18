import type { APIRoute } from "astro"
import { searchOffers } from "@/application/queries/searchOffers.query"
import { normalizeSearchResults } from "@/application/search/search.normalizer"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const { productId, checkIn, checkOut, adults, children = 0, currency = "USD" } = body

	const raw = await searchOffers({
		productId,
		checkIn: new Date(checkIn),
		checkOut: new Date(checkOut),
		adults,
		children,
	})

	const response = {
		currency,
		checkIn,
		checkOut,
		nights: (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
		variants: normalizeSearchResults(raw),
	}

	return new Response(JSON.stringify(response), { status: 200 })
}
