import type { APIRoute } from "astro"
import { ratePlanCommandRepository } from "@/container"
import { deleteRatePlanLegacy } from "@/modules/pricing/public"

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		let id = url.searchParams.get("id")

		if (!id) {
			const body = await request.json().catch(() => null)
			id = body?.id
		}

		if (!id) {
			return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
		}
		return deleteRatePlanLegacy({ repo: ratePlanCommandRepository }, { id })
	} catch (e) {
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
