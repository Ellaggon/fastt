import type { APIRoute } from "astro"
import { selectRatePlans } from "@/core/rate-plans/ratePlan.selector"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const ratePlans = await selectRatePlans({
		variantId: body.variantId,
		checkIn: new Date(body.checkIn),
		checkOut: new Date(body.checkOut),
	})

	return new Response(JSON.stringify(ratePlans), { status: 200 })
}
