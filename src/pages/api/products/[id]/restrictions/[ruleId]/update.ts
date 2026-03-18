import type { APIRoute } from "astro"
import { updateRestriction } from "@/modules/catalog/application/use-cases/update-restriction"

export const PUT: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const ruleId = params.ruleId
	const body = await request.json()
	return updateRestriction({ productId: productId || "", ruleId: ruleId || "", body })
}
