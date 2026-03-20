import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { createRestriction } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const body = await request.json()
	return createRestriction(
		{ repo: catalogRestrictionRepository },
		{ productId: productId || "", body }
	)
}
