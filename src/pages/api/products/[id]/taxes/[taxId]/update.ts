import type { APIRoute } from "astro"
import { taxFeeRepository } from "@/container"
import { updateTax } from "@/modules/catalog/public"

export const PUT: APIRoute = async ({ params, request }) => {
	const { id: productId, taxId } = params
	const body = await request.json()

	const { type, value, currency, isIncluded, isActive } = body
	return updateTax(
		{ repo: taxFeeRepository },
		{
			productId: productId || "",
			taxId: taxId || "",
			type,
			value,
			currency,
			isIncluded,
			isActive,
		}
	)
}
