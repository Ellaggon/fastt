import type { APIRoute } from "astro"
import { ratePlanCommandRepository } from "@/container"
import { updateRatePlanLegacy } from "@/modules/pricing/public"

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		return updateRatePlanLegacy({ repo: ratePlanCommandRepository }, body)
	} catch (err) {
		console.error("rateplans:update", err)
		return new Response(JSON.stringify({ error: "Update failed" }), { status: 500 })
	}
}
