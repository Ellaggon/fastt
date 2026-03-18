import type { APIRoute } from "astro"
import { createTax } from "@/modules/catalog/application/use-cases/create-tax"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const body = await request.json()

	const { type, value, currency, isIncluded, isActive } = body
	return createTax({ productId: productId || "", type, value, currency, isIncluded, isActive })
}
