import type { APIRoute } from "astro"
import { cancellationPolicyRepository } from "@/container"
import { createCancellationPolicy } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) return new Response("Missing productId", { status: 400 })

	const { name, tiers } = await request.json()
	return createCancellationPolicy({ repo: cancellationPolicyRepository, productId, name, tiers })
}
