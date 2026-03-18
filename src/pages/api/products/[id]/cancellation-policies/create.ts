import type { APIRoute } from "astro"
import { createCancellationPolicy } from "@/modules/catalog/application/use-cases/create-cancellation-policy"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) return new Response("Missing productId", { status: 400 })

	const { name, tiers } = await request.json()
	return createCancellationPolicy({ productId, name, tiers })
}
