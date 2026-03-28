import type { APIRoute } from "astro"
import { resolvePoliciesUseCase } from "@/container"

export const GET: APIRoute = async ({ url }) => {
	const productId = url.searchParams.get("productId")
	const variantId = url.searchParams.get("variantId")

	const policies = await resolvePoliciesUseCase({
		productId,
		variantId,
	})

	return new Response(JSON.stringify(policies), {
		headers: { "Content-Type": "application/json" },
	})
}
