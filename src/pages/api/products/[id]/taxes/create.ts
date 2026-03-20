import type { APIRoute } from "astro"
import { taxFeeRepository } from "@/container"
import { createTax } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const body = await request.json()

	const { type, value, currency, isIncluded, isActive } = body
	return createTax(
		{ repo: taxFeeRepository },
		{ productId: productId || "", type, value, currency, isIncluded, isActive }
	)
}
