import type { APIRoute } from "astro"
import { getRatePlanById } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ url }) => {
	const id = url.searchParams.get("id")
	if (!id) {
		return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
	}

	const result = await getRatePlanById(id)
	if (!result) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
	return new Response(JSON.stringify(result), { status: 200 })
}
