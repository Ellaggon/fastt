import type { APIRoute } from "astro"
import { listRatePlansByVariant } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ url }) => {
	const variantId = url.searchParams.get("variantId")
	if (!variantId) {
		return new Response(JSON.stringify({ error: "Missing variantId" }), { status: 400 })
	}

	const result = await listRatePlansByVariant(variantId)
	return new Response(JSON.stringify(result), { status: 200 })
}
