import type { APIRoute } from "astro"
import { listHouseRulesByProduct } from "@/modules/house-rules/public"

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url)
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	if (!productId)
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})

	const rules = await listHouseRulesByProduct(productId)
	return new Response(JSON.stringify(rules), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
