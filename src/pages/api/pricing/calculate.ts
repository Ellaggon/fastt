import type { APIRoute } from "astro"
import { calculatePrice } from "@/core/pricing/pricing.engine"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const result = calculatePrice(
		{
			basePriceUSD: body.basePriceUSD,
			basePriceBOB: body.basePriceBOB,
			nights: body.nights,
		},
		body.ratePlan,
		body.currency
	)

	return new Response(JSON.stringify(result), { status: 200 })
}
