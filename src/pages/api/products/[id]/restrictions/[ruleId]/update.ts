import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { updateRestriction } from "@/modules/catalog/public"

export const PUT: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const ruleId = params.ruleId
	const body = await request.json()
	return updateRestriction(
		{ repo: catalogRestrictionRepository },
		{ productId: productId || "", ruleId: ruleId || "", body }
	)
}
