import type { APIRoute } from "astro"
import { createRestriction } from "@/modules/catalog/application/use-cases/create-restriction"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const body = await request.json()
	return createRestriction({ productId: productId || "", body })
}
