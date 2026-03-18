import type { APIRoute } from "astro"
import { resolvePolicies } from "@/core/policy/runtime/policy.engine"

export const GET: APIRoute = async ({ url }) => {
	const hotelId = url.searchParams.get("hotelId")
	const productId = url.searchParams.get("productId")
	const variantId = url.searchParams.get("variantId")

	const policies = await resolvePolicies({
		hotelId,
		productId,
		variantId,
	})

	return new Response(JSON.stringify(policies), {
		headers: { "Content-Type": "application/json" },
	})
}
